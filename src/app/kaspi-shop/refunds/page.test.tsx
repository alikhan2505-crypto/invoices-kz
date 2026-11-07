// @vitest-environment happy-dom
// Возвраты: список грузится при первом открытии (K28), «Показать ещё» (K30), сбой Kaspi
// виден как ошибка, а не «Заявок нет» (K35).
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
vi.mock('@/components/PageHeader', () => ({
  default: ({ title }: any) => createElement('h1', null, title),
}))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))

import RefundsPage from './page'

const item = (n: number) => ({
  refundId: `r${n}`, applicationNumber: `A-${n}`, order: `O${n}`, productSku: 'S', customer: `Покупатель ${n}`,
  sum: 1000 + n, quantity: 1, reasonDescription: 'Не подошёл', statusText: 'Возврат оформляется',
})

let world: {
  counts: { status: number; body: any }
  list: (tab: string, page: number) => { status: number; body: any }
  calls: string[]
  // Если задан, запросы подгрузки (page=1) ждут этого промиса: «смена вкладки в полёте».
  gate?: Promise<void>
  wallet: () => Response
}

function installFetch() {
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input)
    world.calls.push(url)
    if (url === '/api/kaspi-shop/wallet') return world.wallet()
    if (url === '/api/kaspi-shop/refunds/counts') return json(world.counts.status, world.counts.body)
    if (url.startsWith('/api/kaspi-shop/refunds?')) {
      const u = new URL(url, 'http://x')
      if (world.gate && u.searchParams.get('page') === '1') await world.gate
      const r = world.list(u.searchParams.get('tab')!, Number(u.searchParams.get('page')))
      return json(r.status, r.body)
    }
    return json(404, { error: `unexpected ${url}` })
  }) as any
}

beforeEach(() => {
  world = {
    counts: { status: 200, body: { counts: [{ tab: 'NEW', tabTitle: 'Новые', total: 1 }] } },
    list: () => ({ status: 200, body: { refunds: [item(1)], total: 1 } }),
    calls: [],
    wallet: () => json(200, { connected: true, sessionStatus: 'active' }),
  }
  installFetch()
  push.mockReset()
})
afterEach(async () => { await unmountPage() })

describe('страница Возвраты', () => {
  it('K28: первая занятая вкладка «Новые» совпадает с начальной, и список всё равно загружается', async () => {
    await mountPage(RefundsPage)
    expect(world.calls.some(c => c.startsWith('/api/kaspi-shop/refunds?tab=NEW&page=0'))).toBe(true)
    expect(pageText()).toContain('A-1')
    expect(pageText()).not.toContain('Заявок в этой вкладке нет')
  })

  it('K30: «Показать ещё» догружает следующую страницу по total из ответа', async () => {
    world.list = (_tab, page) => ({
      status: 200,
      body: { refunds: Array.from({ length: page === 2 ? 5 : 10 }, (_, i) => item(page * 10 + i + 1)), total: 25 },
    })
    await mountPage(RefundsPage)
    expect(pageText()).toContain('Показано 10 из 25')
    await click(byText('button', 'Показать ещё'))
    expect(world.calls.some(c => c.includes('page=1'))).toBe(true)
    expect(pageText()).toContain('Показано 20 из 25')
    await click(byText('button', 'Показать ещё'))
    expect(pageText()).toContain('Показано 25 из 25')
    expect(byText('button', 'Показать ещё')).toBeNull()
  })

  it('K35: сбой Kaspi (502) показан как ошибка с «Повторить», а не «Заявок в этой вкладке нет»', async () => {
    world.list = () => ({ status: 502, body: { error: 'Не удалось получить заявки от Kaspi (Kaspi ответил HTTP 500). Повторите позже.' } })
    await mountPage(RefundsPage)
    expect(pageText()).toContain('Не удалось получить заявки от Kaspi')
    expect(pageText()).not.toContain('Заявок в этой вкладке нет')
    expect(byText('button', 'Повторить')).not.toBeNull()
  })

  it('сбой счётчиков не маскируется под «заявок нет»: объясняется отдельной строкой, список всё равно грузится', async () => {
    world.counts = { status: 502, body: { error: 'Kaspi не ответил' } }
    await mountPage(RefundsPage)
    expect(pageText()).toContain('Числа у вкладок не загрузились')
    expect(world.calls.some(c => c.startsWith('/api/kaspi-shop/refunds?tab='))).toBe(true)
  })

  it('честно пустая вкладка говорит «Заявок в этой вкладке нет»', async () => {
    world.counts = { status: 200, body: { counts: [] } }
    world.list = () => ({ status: 200, body: { refunds: [], total: 0 } })
    await mountPage(RefundsPage)
    expect(pageText()).toContain('Заявок в этой вкладке нет')
  })

  it('смена вкладки во время подгрузки не оставляет «Загружаем…» навсегда: на новой вкладке «Показать ещё» доступна', async () => {
    world.counts = { status: 200, body: { counts: [{ tab: 'NEW', total: 25 }, { tab: 'ON_DELIVERY', total: 25 }] } }
    world.list = (tab, page) => ({
      status: 200,
      body: { refunds: Array.from({ length: 10 }, (_, i) => item((tab === 'NEW' ? 100 : 200) + page * 10 + i)), total: 25 },
    })
    let release!: () => void
    world.gate = new Promise<void>(r => { release = r })
    await mountPage(RefundsPage)
    expect(pageText()).toContain('Показано 10 из 25')
    // Подгрузка вкладки «Новые» зависла в полёте.
    await click(byText('button', 'Показать ещё'))
    expect(byText('button', 'Загружаем…')).not.toBeNull()
    // Пользователь переключает вкладку, не дождавшись ответа.
    await click(byText('button', 'На доставке'))
    expect(pageText()).toContain('Показано 10 из 25')
    const more = byText('button', 'Показать ещё') as HTMLButtonElement | null
    expect(more).not.toBeNull()
    expect(more!.disabled).toBe(false)
    // Устаревший ответ приходит позже: не затирает новую вкладку и не ломает кнопку.
    await act(async () => { release() })
    await flush()
    expect(pageText()).toContain('Показано 10 из 25')
    expect((byText('button', 'Показать ещё') as HTMLButtonElement).disabled).toBe(false)
  })

  it('K12: сбой запроса подключения (500) показывает «Повторить», а не уводит на /kaspi-shop', async () => {
    world.wallet = () => json(500, { error: 'Сервис временно недоступен' })
    await mountPage(RefundsPage)
    expect(push).not.toHaveBeenCalled()
    expect(byText('button', 'Повторить')).not.toBeNull()
    world.wallet = () => json(200, { connected: true, sessionStatus: 'active' })
    await click(byText('button', 'Повторить'))
    expect(push).not.toHaveBeenCalled()
    expect(pageText()).toContain('A-1')
  })

  it('K12: честно не подключённый магазин по-прежнему уводит на /kaspi-shop', async () => {
    world.wallet = () => json(200, { connected: false })
    await mountPage(RefundsPage)
    expect(push).toHaveBeenCalledWith('/kaspi-shop')
  })
})
