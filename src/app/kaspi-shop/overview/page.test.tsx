// @vitest-environment happy-dom
// Обзор Kaspi Bot: сбой любого из запросов (товары, прибыль, счётчики) это «—» и причина, а не «0 из 0» (K36).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { json, mountPage, unmountPage, pageText } from '@/lib/kaspiShop/pageTestKit'

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
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
vi.mock('@/components/SiteNav', () => ({ default: () => null }))
vi.mock('@/components/DesktopShell', () => ({ default: ({ children }: any) => children }))
vi.mock('@/components/LoadingSpinner', () => ({ default: () => createElement('div', null, 'loading') }))
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: any) => createElement('h1', null, title) }))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))
vi.mock('@/lib/useCrossHref', () => ({ useCrossHref: () => () => '#' }))

import OverviewPage from './page'

type Route = () => Response
let routes: Record<string, Route>

const okProducts = () => json(200, { products: [
  { own_current_price: 900, last_competitor_price: 1000, floor_price: 800 },
  { own_current_price: 800, last_competitor_price: 700, floor_price: 800 },
] })
const okCounters = () => json(200, { counts: { NEW: 0, PICKUP: 0 } })
const okProfit = () => json(200, { netProfit: 5000, totalRevenue: 20000, productsWithoutCogsCount: 0 })

beforeEach(() => {
  router.push.mockReset()
  routes = {
    '/api/kaspi-shop/wallet': () => json(200, { connected: true, sessionStatus: 'active' }),
    '/api/kaspi-shop/products': okProducts,
    '/api/kaspi-shop/orders/counters': okCounters,
    '/api/kaspi-shop/profit': okProfit,
  }
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input).split('?')[0]
    const r = routes[url]
    return r ? r() : json(404, { error: `unexpected ${url}` })
  }) as any
})
afterEach(async () => { vi.restoreAllMocks(); await unmountPage() })

describe('Обзор: сбой товаров', () => {
  it('товары загрузились: «1 из 2», «упёрлись в минимум: 1»', async () => {
    await mountPage(OverviewPage)
    expect(pageText()).toContain('1 из 2')
    expect(pageText()).toContain('упёрлись в минимум: 1')
  })

  it('товары вернули 500: «—» и причина, а не «0 из 0»', async () => {
    routes['/api/kaspi-shop/products'] = () => json(500, { error: 'db down' })
    await mountPage(OverviewPage)
    expect(pageText()).not.toContain('0 из 0')
    expect(pageText()).not.toContain('упёрлись в минимум: 0')
    expect(pageText()).toContain('не удалось загрузить товары')
  })

  it('ответ без списка товаров тоже сбой', async () => {
    routes['/api/kaspi-shop/products'] = () => json(200, {})
    await mountPage(OverviewPage)
    expect(pageText()).not.toContain('0 из 0')
    expect(pageText()).toContain('не удалось загрузить товары')
  })
})

describe('Обзор: сбой прибыли', () => {
  it('прибыль посчиталась: сумма видна', async () => {
    await mountPage(OverviewPage)
    expect(pageText()).toContain('выручка')
  })

  it('прибыль вернула 500: «—» и причина, не «после комиссии и расходов»', async () => {
    routes['/api/kaspi-shop/profit'] = () => json(500, { error: 'boom' })
    await mountPage(OverviewPage)
    expect(pageText()).toContain('не удалось получить заказы из Kaspi')
    expect(pageText()).not.toContain('после комиссии и расходов')
  })

  it('прибыль с upstreamFailed: тот же честный «—»', async () => {
    routes['/api/kaspi-shop/profit'] = () => json(200, { upstreamFailed: true })
    await mountPage(OverviewPage)
    expect(pageText()).toContain('не удалось получить заказы из Kaspi')
  })

  it('502 от истёкшей сессии не выдаёт себя за сбой расчёта', async () => {
    routes['/api/kaspi-shop/profit'] = () => json(502, { error: 'сессия', sessionExpired: true })
    await mountPage(OverviewPage)
    expect(pageText()).not.toContain('не удалось получить заказы из Kaspi')
  })
})

describe('Обзор: заказы', () => {
  it('сбой счётчиков: «—», а не «0 в работе»', async () => {
    routes['/api/kaspi-shop/orders/counters'] = () => json(502, { error: 'Kaspi не отдал счётчики' })
    await mountPage(OverviewPage)
    expect(pageText()).toContain('не удалось получить из Kaspi')
    expect(pageText()).not.toContain('Сейчас нет заказов в работе')
  })
})
