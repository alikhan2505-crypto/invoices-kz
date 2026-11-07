// @vitest-environment happy-dom
// Качество: таблица категорий грузится при первом открытии (K29), «Показать ещё» (K30),
// крупное число это percentage, а goodValue это цель (K31), сбой Kaspi виден (K35).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { json, mountPage, unmountPage, pageText, byText, click, flush } from '@/lib/kaspiShop/pageTestKit'

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

import QualityPage from './page'

const details = (o: any = {}) => ({
  goodValue: 5, violationValue: 10, zonePercentage: 20, percentage: 0, daysPerPeriod: 30,
  from: '2026-10-07T19:00:00.000Z', to: '2026-11-06T18:59:59.999Z', notEnoughData: false, numerator: 0, denominator: 0, ...o,
})
const overview = (o: any = {}) => ({
  rating: { ...details({ goodValue: 4.6, violationValue: 4.0, percentage: 0, daysPerPeriod: 90, numerator: 4 }), statistics: { oneCount: 0, twoCount: 0, threeCount: 0, fourCount: 1, fiveCount: 3 } },
  returns: details({ goodValue: 1, violationValue: 2, percentage: 0.7, numerator: 3, denominator: 400 }),
  lateDelivery: details({ goodValue: 5, violationValue: 10, percentage: 7.5, numerator: 9, denominator: 120 }),
  cancellations: details({ goodValue: 1, violationValue: 3, percentage: 0, numerator: 0, denominator: 50 }),
  ordersCount: 120,
  warning: null,
  ...o,
})
const cat = (n: number) => ({
  categoryCode: `c${n}`, categoryDisplayName: `Категория ${n}`, performanceStatus: 'TOP',
  metric: { percentage: 0, totalCount: 10, violatedCount: 0, notEnoughData: false },
})

let world: {
  overview: { status: number; body: any }
  cats: (tab: string, page: number) => { status: number; body: any }
  calls: string[]
  wallet: () => Response
  // Если задан, запросы подгрузки (page=1) ждут этого промиса: «смена вкладки в полёте».
  gate?: Promise<void>
}
function installFetch() {
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input)
    world.calls.push(url)
    if (url === '/api/kaspi-shop/wallet') return world.wallet()
    if (url === '/api/kaspi-shop/quality/overview') return json(world.overview.status, world.overview.body)
    if (url.startsWith('/api/kaspi-shop/quality/categories?')) {
      const u = new URL(url, 'http://x')
      if (world.gate && u.searchParams.get('page') === '1') await world.gate
      const r = world.cats(u.searchParams.get('tab')!, Number(u.searchParams.get('page')))
      return json(r.status, r.body)
    }
    return json(404, { error: `unexpected ${url}` })
  }) as any
}

beforeEach(() => {
  world = {
    overview: { status: 200, body: { overview: overview() } },
    cats: () => ({ status: 200, body: { categories: [cat(1), cat(2)], total: 2 } }),
    calls: [],
    wallet: () => json(200, { connected: true, sessionStatus: 'active' }),
  }
  installFetch()
  push.mockReset()
})
afterEach(async () => { await unmountPage() })

describe('страница Качество', () => {
  it('K29: таблица «По категориям» грузится при первом открытии, без переключения вкладки', async () => {
    await mountPage(QualityPage)
    expect(world.calls.some(c => c.startsWith('/api/kaspi-shop/quality/categories?tab=rating&page=0'))).toBe(true)
    expect(pageText()).toContain('Категория 1')
    expect(pageText()).not.toContain('Категорий пока нет')
  })

  it('K30: «Показать ещё» догружает категории по total из ответа', async () => {
    world.cats = (_tab, page) => ({
      status: 200,
      body: { categories: Array.from({ length: page === 2 ? 5 : 10 }, (_, i) => cat(page * 10 + i + 1)), total: 25 },
    })
    await mountPage(QualityPage)
    expect(pageText()).toContain('Показано 10 из 25')
    await click(byText('button', 'Показать ещё'))
    expect(pageText()).toContain('Показано 20 из 25')
    await click(byText('button', 'Показать ещё'))
    expect(byText('button', 'Показать ещё')).toBeNull()
  })

  it('K31: на вкладке с процентом крупное число это percentage, а goodValue показан как цель', async () => {
    await mountPage(QualityPage)
    await click(byText('button', 'Задержки при передачах'))
    const text = pageText()
    expect(text).toContain('7,5%') // percentage, не goodValue 5
    expect(text).toContain('цель Kaspi: не выше 5%')
    expect(text).toContain('санкции выше 10%')
    expect(text).toContain('9 из 120')
  })

  it('K31: рейтинг это среднее из распределения оценок, а не goodValue 4.6', async () => {
    await mountPage(QualityPage)
    // (4*1 + 5*3) / 4 = 4.75 -> «4.8»
    expect(pageText()).toContain('4.8')
    expect(pageText()).toContain('цель Kaspi: не ниже 4.6')
  })

  it('K31: «данных недостаточно» не выдаёт goodValue за текущее значение', async () => {
    world.overview = { status: 200, body: { overview: overview({ lateDelivery: details({ goodValue: 5, percentage: 0, numerator: 0, denominator: 7, notEnoughData: true }) }) } }
    await mountPage(QualityPage)
    await click(byText('button', 'Задержки при передачах'))
    const text = pageText()
    expect(text).toContain('данных за период недостаточно')
    expect(text).not.toContain('5%')
    expect(text).not.toContain('сформируется после 7 заказов') // число 7 это текущая выборка, а не порог
  })

  it('K35: сбой категорий виден ошибкой с «Повторить», а не «Категорий пока нет»', async () => {
    world.cats = () => ({ status: 502, body: { error: 'Не удалось получить категории от Kaspi (Kaspi ответил HTTP 500). Повторите позже.' } })
    await mountPage(QualityPage)
    expect(pageText()).toContain('Не удалось получить категории от Kaspi')
    expect(pageText()).not.toContain('Категорий пока нет')
    expect(byText('button', 'Повторить')).not.toBeNull()
  })

  it('K35: сбой показателей это ошибка вверху страницы, а не пустая страница', async () => {
    world.overview = { status: 502, body: { error: 'Не удалось получить показатели качества от Kaspi. Повторите позже.' } }
    await mountPage(QualityPage)
    expect(pageText()).toContain('Не удалось получить показатели качества от Kaspi')
  })

  it('честно пустой список категорий говорит «Категорий пока нет»', async () => {
    world.cats = () => ({ status: 200, body: { categories: [], total: 0 } })
    await mountPage(QualityPage)
    expect(pageText()).toContain('Категорий пока нет')
  })

  it('смена вкладки во время подгрузки не оставляет «Загружаем…» навсегда: на новой вкладке «Показать ещё» доступна', async () => {
    world.cats = (tab, page) => ({
      status: 200,
      body: { categories: Array.from({ length: 10 }, (_, i) => cat((tab === 'rating' ? 100 : 200) + page * 10 + i)), total: 25 },
    })
    let release!: () => void
    world.gate = new Promise<void>(r => { release = r })
    await mountPage(QualityPage)
    expect(pageText()).toContain('Показано 10 из 25')
    await click(byText('button', 'Показать ещё'))
    expect(byText('button', 'Загружаем…')).not.toBeNull()
    await click(byText('button', 'Задержки при передачах'))
    expect(pageText()).toContain('Показано 10 из 25')
    const more = byText('button', 'Показать ещё') as HTMLButtonElement | null
    expect(more).not.toBeNull()
    expect(more!.disabled).toBe(false)
    await act(async () => { release() })
    await flush()
    expect(pageText()).toContain('Показано 10 из 25')
    expect((byText('button', 'Показать ещё') as HTMLButtonElement).disabled).toBe(false)
  })

  it('K12: сбой запроса подключения (500) показывает «Повторить», а не уводит на /kaspi-shop', async () => {
    world.wallet = () => json(500, { error: 'Сервис временно недоступен' })
    await mountPage(QualityPage)
    expect(push).not.toHaveBeenCalled()
    expect(byText('button', 'Повторить')).not.toBeNull()
    // «Повторить» заново проверяет подключение и открывает страницу.
    world.wallet = () => json(200, { connected: true, sessionStatus: 'active' })
    await click(byText('button', 'Повторить'))
    expect(push).not.toHaveBeenCalled()
    expect(pageText()).toContain('Качество')
    expect(pageText()).toContain('Категория 1')
  })

  it('K12: честно не подключённый магазин по-прежнему уводит на /kaspi-shop', async () => {
    world.wallet = () => json(200, { connected: false })
    await mountPage(QualityPage)
    expect(push).toHaveBeenCalledWith('/kaspi-shop')
  })
})
