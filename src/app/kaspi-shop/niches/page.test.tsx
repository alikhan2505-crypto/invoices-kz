// @vitest-environment happy-dom
// Ниши: сбой трендов это ошибка, а не «трендов нет»; шлюзовый не-JSON ответ не превращается в «проверьте соединение».
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { json, mountPage, unmountPage, pageText, byText, click } from '@/lib/kaspiShop/pageTestKit'


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

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const strip = ({ initial, animate, exit, transition, whileHover, whileTap, layout, layoutId, ...rest }: any) => rest
  const cache: Record<string, any> = {}
  const motion = new Proxy({}, {
    get: (_t, tag: string) => (cache[tag] ||= React.forwardRef((props: any, ref: any) => React.createElement(tag, { ...strip(props), ref }))),
  })
  return { motion, AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children), useReducedMotion: () => true }
})
vi.mock('@/components/kaspiShop/NicheCollections', () => ({ default: () => null }))
vi.mock('@/components/kaspiShop/Source1688Button', () => ({ default: () => null }))

import NichesPage from './page'

let trends: () => Response
let trendCalls: number

const okTrends = () => json(200, {
  computedAt: null, categories: [], page: 1, pageSize: 10, totalCategories: 0, categoryOptions: [], topShare: [], trendingAll: [],
})

beforeEach(() => {
  router.push.mockReset()
  trendCalls = 0
  trends = okTrends
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input).split('?')[0]
    if (url === '/api/kaspi-shop/wallet') return json(200, { connected: true, sessionStatus: 'active', balance: 500 })
    if (url === '/api/kaspi-shop/niches/trends') { trendCalls++; return trends() }
    return json(404, { error: `unexpected ${url}` })
  }) as any
})
afterEach(async () => { vi.restoreAllMocks(); await unmountPage() })

describe('Ниши: тренды', () => {
  it('тренды с сервера 502: текст сервера, страница остаётся', async () => {
    trends = () => json(502, { error: 'Не удалось загрузить данные' })
    await mountPage(NichesPage)
    expect(pageText()).toContain('Не удалось загрузить данные')
    expect(trendCalls).toBe(1)
  })

  it('тренды не JSON (шлюз): «Не удалось загрузить тренды», а не «проверьте соединение»', async () => {
    trends = () => new Response('<html>Bad gateway</html>', { status: 502 })
    await mountPage(NichesPage)
    expect(pageText()).toContain('Не удалось загрузить тренды')
    expect(pageText()).not.toContain('Проверьте соединение')
  })

  it('200 без списка категорий считается сбоем, а не пустыми трендами', async () => {
    trends = () => json(200, { computedAt: null })
    await mountPage(NichesPage)
    expect(pageText()).toContain('Не удалось загрузить тренды')
  })

  it('нормальный ответ: ошибки нет', async () => {
    await mountPage(NichesPage)
    expect(pageText()).not.toContain('Не удалось загрузить тренды')
  })
})
