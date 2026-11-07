// @vitest-environment happy-dom
// Нераспознанные товары: плашка «сессия истекла» уходит после успешной повторной загрузки; сбой это не «товаров нет».
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

import PendingPage from './page'

let pending: () => Response

beforeEach(() => {
  router.push.mockReset()
  pending = () => json(200, { products: [], hasMore: false, count: 0, sessionExpired: false })
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input).split('?')[0]
    if (url === '/api/kaspi-shop/wallet') return json(200, { connected: true, sessionStatus: 'active' })
    if (url === '/api/kaspi-shop/pending-products') return pending()
    return json(404, { error: `unexpected ${url}` })
  }) as any
})
afterEach(async () => { vi.restoreAllMocks(); await unmountPage() })

describe('Нераспознанные товары: сбой и повтор', () => {
  it('502 с истёкшей сессией: плашка «Переподключиться» и текст сервера, не «товаров нет»', async () => {
    pending = () => json(502, { error: 'Сессия кабинета Kaspi истекла — переподключите магазин', sessionExpired: true })
    await mountPage(PendingPage)
    expect(pageText()).toContain('Переподключиться')
    expect(pageText()).toContain('Сессия кабинета Kaspi истекла — переподключите магазин')
    expect(pageText()).not.toContain('Нераспознанных товаров нет')
  })

  it('после успешного «Повторить» плашка истёкшей сессии и ошибка пропадают', async () => {
    pending = () => json(502, { error: 'Сессия кабинета Kaspi истекла — переподключите магазин', sessionExpired: true })
    await mountPage(PendingPage)
    pending = () => json(200, { products: [], hasMore: false, count: 0, sessionExpired: false })
    await click(byText('button', 'Повторить'))
    expect(pageText()).not.toContain('Переподключиться')
    expect(pageText()).toContain('Нераспознанных товаров нет')
  })
})
