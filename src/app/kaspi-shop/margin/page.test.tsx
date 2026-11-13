// @vitest-environment happy-dom
// Калькулятор маржи: товар «в наличии» (переход из Демпинга, P11 13.11.2026) не платит карго.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
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
  const strip = ({ initial, animate, exit, transition, whileHover, whileTap, layout, ...rest }: any) => rest
  const cache: Record<string, any> = {}
  const motion = new Proxy({}, {
    get: (_t, tag: string) => (cache[tag] ||= React.forwardRef((props: any, ref: any) => React.createElement(tag, { ...strip(props), ref }))),
  })
  return { motion, AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children), useReducedMotion: () => true }
})
vi.mock('@/components/SiteNav', () => ({ default: () => null }))
vi.mock('@/components/DesktopShell', () => ({ default: ({ children }: any) => children }))
vi.mock('@/components/LoadingSpinner', () => ({ default: () => createElement('div', null, 'loading') }))
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: any) => createElement('h1', null, title) }))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))
vi.mock('@/components/kaspiShop/TopSellersPicker', () => ({ default: () => null }))
vi.mock('@/components/kaspiShop/Source1688Panel', () => ({ default: () => null }))

import KaspiShopMargin from './page'

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let root: Root
let host: HTMLDivElement

async function mount(search: string) {
  window.history.replaceState({}, '', `/kaspi-shop/margin${search}`)
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input)
    if (url === '/api/kaspi-shop/wallet') return json(200, { connected: true, sessionStatus: 'active' })
    if (url === '/api/kaspi-shop/margin') return json(200, { evaluations: [], targetMarginPercent: 20 })
    return json(404, { error: `unexpected ${url}` })
  }) as any
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(createElement(KaspiShopMargin)) })
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  host?.remove()
  document.body.innerHTML = ''
})

const text = () => (document.body.textContent || '').replace(/[\s  ]+/g, ' ')
const hasCargoField = () => Array.from(document.body.querySelectorAll('label')).some(l => (l.textContent || '').includes('Карго, ₸/кг'))
const checkbox = () => document.body.querySelector('input[type="checkbox"]') as HTMLInputElement

describe('карго и «товар в наличии»', () => {
  beforeEach(() => { window.history.replaceState({}, '', '/kaspi-shop/margin') })

  it('обычный вход: поле «Карго» есть, галочки «в наличии» нет', async () => {
    await mount('')
    expect(hasCargoField()).toBe(true)
    expect(checkbox().checked).toBe(false)
  })

  it('переход из Демпинга (?instock=1): галочка стоит, поля «Карго» нет, название и цена подставлены', async () => {
    await mount('?name=Elma%2072%20%D1%88%D1%82&price=600&instock=1')
    expect(checkbox().checked).toBe(true)
    expect(hasCargoField()).toBe(false)
    const inputs = Array.from(document.body.querySelectorAll('input')) as HTMLInputElement[]
    expect(inputs.some(i => i.value === 'Elma 72 шт')).toBe(true)
    expect(inputs.some(i => i.value === '600')).toBe(true)
    expect(text()).toContain('Товар уже есть в наличии: карго не считаем')
  })

  it('галочку можно снять и поставить: поле «Карго» возвращается и пропадает', async () => {
    await mount('?price=1000&instock=1')
    expect(hasCargoField()).toBe(false)
    await act(async () => { checkbox().click() })
    expect(checkbox().checked).toBe(false)
    expect(hasCargoField()).toBe(true)
    await act(async () => { checkbox().click() })
    expect(hasCargoField()).toBe(false)
  })
})
