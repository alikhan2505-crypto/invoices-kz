// @vitest-environment happy-dom
// Финансы: сбой Kaspi это баннер и «—», а не 0 ₸ и «заказов нет» (K35); «Свой период»
// шлёт дату since=YYYY-MM-DD, граница считается на сервере по Алматы (K37); честная подпись
// про неполную выборку (K38); числа не налезают друг на друга на телефоне (K39).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { json, mountPage, unmountPage, pageText, byText, click, typeInto, flush } from '@/lib/kaspiShop/pageTestKit'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase', () => {
  const profile = { is_admin: true, plan: 'pro' }
  const q: any = { select: () => q, eq: () => q, single: async () => ({ data: profile }) }
  return {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1' } } }),
        getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
      },
      from: () => q,
    },
  }
})
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const strip = ({ initial, animate, exit, transition, whileHover, whileTap, layout, layoutId, ...rest }: any) => rest
  const cache: Record<string, any> = {}
  const motion = new Proxy({}, {
    get: (_t, tag: string) => (cache[tag] ||= React.forwardRef((props: any, ref: any) => React.createElement(tag, { ...strip(props), ref }))),
  })
  return { motion, AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children), useReducedMotion: () => true }
})
vi.mock('@/components/SiteNav', () => ({ default: () => null }))
vi.mock('@/components/DesktopShell', () => ({ default: ({ children }: any) => children }))
vi.mock('@/components/LoadingSpinner', () => ({ default: () => createElement('div', null, 'loading') }))
vi.mock('@/components/kaspiShop/SessionExpiredBanner', () => ({ default: () => null }))
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: any) => createElement('h1', null, title) }))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))

import FinancePage from './page'

const behavioral = {
  byWeekday: Array.from({ length: 7 }, (_, day) => ({ day, label: 'Пн', orderCount: 0, revenue: 0 })),
  byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, orderCount: 0 })),
  beforePayday: { orderCount: 0, revenue: 0 }, afterPayday: { orderCount: 0, revenue: 0 },
  genderEstimate: { male: 0, female: 0, unknown: 0 }, holidayOrders: [],
}
const summary = (o: any = {}) => ({
  totalRevenue: 1234567, orderCount: 321, averageOrderValue: 3846.0, byDay: [{ date: '2026-11-06', revenue: 1234567, orderCount: 321, unitsSold: 400 }],
  behavioral, abc: [], byColor: [], bySize: [], truncated: false, sessionExpired: false, upstreamFailed: false,
  periodFrom: '2026-10-08', fetchedOrders: 321, newestFirst: true, ...o,
})

let world: {
  summary: any
  calls: string[]
  wallet: () => Response
  // Запрос с этим фрагментом в адресе ждёт промиса: «медленный ответ на прошлый период».
  hold?: { match: string; gate: Promise<void>; summary: any }
}
function installFetch() {
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input)
    world.calls.push(url)
    if (url === '/api/kaspi-shop/wallet') return world.wallet()
    if (url.startsWith('/api/kaspi-shop/finance?')) {
      if (world.hold && url.includes(world.hold.match)) { await world.hold.gate; return json(200, world.hold.summary) }
      return json(200, world.summary)
    }
    return json(404, { error: `unexpected ${url}` })
  }) as any
}
const financeCalls = () => world.calls.filter(c => c.startsWith('/api/kaspi-shop/finance?'))

beforeEach(() => {
  world = { summary: summary(), calls: [], wallet: () => json(200, { connected: true, sessionStatus: 'active' }) }
  installFetch()
  push.mockReset()
})
afterEach(async () => { await unmountPage() })

describe('страница Финансы', () => {
  it('K35: сбой Kaspi без единого заказа это баннер и «—», а не 0 ₸ и «За этот период выполненных заказов нет»', async () => {
    world.summary = summary({ totalRevenue: 0, orderCount: 0, averageOrderValue: 0, byDay: [], upstreamFailed: true })
    await mountPage(FinancePage)
    const text = pageText()
    expect(text).toContain('Kaspi не ответил на часть запросов к заказам')
    expect(text).toContain('цифры неизвестны')
    expect(text).not.toContain('выполненных заказов нет')
    expect(text).not.toMatch(/(^| )0 ₸ выручка/)
    expect(byText('button', 'Повторить')).not.toBeNull()
  })

  it('K35: сбой на середине листания оставляет набранное, но называет цифры неполными', async () => {
    world.summary = summary({ upstreamFailed: true })
    await mountPage(FinancePage)
    expect(pageText()).toContain('цифры ниже неполные')
    expect(pageText()).toContain('1 234 567')
  })

  it('честно пустой период говорит «заказов нет»', async () => {
    world.summary = summary({ totalRevenue: 0, orderCount: 0, averageOrderValue: 0, byDay: [] })
    await mountPage(FinancePage)
    expect(pageText()).toContain('За этот период выполненных заказов нет')
  })

  it('K37: «Свой период» отправляет на сервер дату since=YYYY-MM-DD, а не число суток', async () => {
    await mountPage(FinancePage)
    expect(financeCalls()[0]).toBe('/api/kaspi-shop/finance?days=30')
    await click(byText('button', 'Свой период'))
    const dateInput = document.body.querySelector('input[type="date"]') as HTMLInputElement
    await typeInto(dateInput, '2026-11-01')
    await click(byText('button', 'Применить'))
    expect(financeCalls().at(-1)).toBe('/api/kaspi-shop/finance?since=2026-11-01')
    expect(pageText()).toContain('с 01.11.2026')
  })

  it('K37: пресеты шлют days и подпись называет начало периода по Алматы', async () => {
    await mountPage(FinancePage)
    await click(byText('button', '7 дн.'))
    expect(financeCalls().at(-1)).toBe('/api/kaspi-shop/finance?days=7')
    expect(pageText()).toContain('с 08.10.2026 по сегодня, время Алматы')
  })

  it('K37: подпись дат на графике берётся из строки даты Алматы без сдвига пояса браузера', async () => {
    await mountPage(FinancePage)
    expect(Array.from(document.body.querySelectorAll('svg text')).map(t => t.textContent)).toContain('06.11')
  })

  it('K38: «Учтены последние 200» больше не выдумывается: подпись по тому, что известно о порядке Kaspi', async () => {
    world.summary = summary({ truncated: true, newestFirst: true, fetchedOrders: 200 })
    await mountPage(FinancePage)
    expect(pageText()).toContain('учтены самые свежие заказы')
    await unmountPage()
    world.summary = summary({ truncated: true, newestFirst: false })
    await mountPage(FinancePage)
    expect(pageText()).toContain('Kaspi отдаёт заказы не от новых к старым')
  })

  it('K39: на телефоне выручка занимает всю строку, остальные числа в два столбца и могут переноситься', async () => {
    await mountPage(FinancePage)
    const revenue = (Array.from(document.body.querySelectorAll('div')) as HTMLElement[]).find(d => d.children.length === 0 && (d.textContent || '').replace(/\s/g, '') === '1234567')!
    const cell = revenue.parentElement!
    expect(cell.className).toContain('col-span-2')
    expect(cell.className).toContain('min-w-0')
    expect(revenue.className).toContain('overflow-wrap:anywhere')
    expect(cell.parentElement!.className).toContain('grid-cols-2')
  })

  it('устаревший ответ не затирает сводку: 90 дн., затем 7 дн., медленный ответ на 90 приходит последним', async () => {
    let release!: () => void
    world.hold = { match: 'days=90', gate: new Promise<void>(r => { release = r }), summary: summary({ totalRevenue: 9999000, orderCount: 999 }) }
    world.summary = summary({ totalRevenue: 777000, orderCount: 7 })
    await mountPage(FinancePage)
    await click(byText('button', '90 дн.'))
    await click(byText('button', '7 дн.'))
    expect(pageText().replace(/\s/g, '')).toContain('777000')
    await act(async () => { release() })
    await flush()
    const text = pageText().replace(/\s/g, '')
    expect(text).toContain('777000')
    expect(text).not.toContain('9999000')
    expect(pageText()).not.toContain('Считаем')
  })

  it('K12: сбой запроса подключения (500) показывает «Повторить», а не уводит на /kaspi-shop', async () => {
    world.wallet = () => json(500, { error: 'Сервис временно недоступен' })
    await mountPage(FinancePage)
    expect(push).not.toHaveBeenCalled()
    expect(byText('button', 'Повторить')).not.toBeNull()
    expect(financeCalls()).toHaveLength(0)
    world.wallet = () => json(200, { connected: true, sessionStatus: 'active' })
    await click(byText('button', 'Повторить'))
    expect(push).not.toHaveBeenCalled()
    expect(financeCalls().length).toBeGreaterThan(0)
    expect(pageText()).toContain('1 234 567')
  })

  it('K12: честно не подключённый магазин и истёкшая сессия по-прежнему уводят на /kaspi-shop', async () => {
    world.wallet = () => json(200, { connected: false })
    await mountPage(FinancePage)
    expect(push).toHaveBeenCalledWith('/kaspi-shop')
    await unmountPage()
    push.mockReset()
    world.wallet = () => json(200, { connected: true, sessionStatus: 'session_expired' })
    await mountPage(FinancePage)
    expect(push).toHaveBeenCalledWith('/kaspi-shop')
  })
})
