// @vitest-environment happy-dom
// Каталог НКТ: сбой загрузки списка это ошибка с «Повторить», а не «Отслеживаемых товаров пока нет».
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

import NktPage from './page'

let nkt: () => Response
let calls: number

beforeEach(() => {
  router.push.mockReset()
  calls = 0
  nkt = () => json(200, { products: [] })
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input)
    if (url === '/api/kaspi-shop/wallet') return json(200, { connected: true, sessionStatus: 'active' })
    if (url === '/api/kaspi-shop/nkt') { calls++; return nkt() }
    return json(404, { error: `unexpected ${url}` })
  }) as any
})
afterEach(async () => { vi.restoreAllMocks(); await unmountPage() })

describe('Каталог НКТ: сбой списка', () => {
  it('пустой список без ошибки: «Отслеживаемых товаров пока нет»', async () => {
    await mountPage(NktPage)
    expect(pageText()).toContain('Отслеживаемых товаров пока нет')
  })

  it('500 с текстом: текст сервера и «Повторить», без «товаров пока нет»', async () => {
    nkt = () => json(500, { error: 'База недоступна' })
    await mountPage(NktPage)
    expect(pageText()).toContain('База недоступна')
    expect(pageText()).not.toContain('Отслеживаемых товаров пока нет')
    nkt = () => json(200, { products: [] })
    await click(byText('button', 'Повторить'))
    expect(calls).toBe(2)
    expect(pageText()).not.toContain('База недоступна')
    expect(pageText()).toContain('Отслеживаемых товаров пока нет')
  })

  it('ответ не JSON (шлюз): ошибка без «проверьте соединение», без «товаров пока нет»', async () => {
    nkt = () => new Response('<html>Bad gateway</html>', { status: 502 })
    await mountPage(NktPage)
    expect(pageText()).toContain('Не удалось загрузить товары')
    expect(pageText()).not.toContain('Проверьте соединение')
    expect(pageText()).not.toContain('Отслеживаемых товаров пока нет')
  })

  it('200 с неверной формой (products не массив) не роняет страницу', async () => {
    nkt = () => json(200, { products: 'oops' })
    await mountPage(NktPage)
    expect(pageText()).toContain('Каталог НКТ')
  })
})
