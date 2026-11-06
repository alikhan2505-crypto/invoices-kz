// @vitest-environment happy-dom
// K46 (аудит Kaspi 2026-11-06): при истёкшей сессии АКТИВНОГО магазина переключатель
// остаётся списком магазинов, кнопка называется «Переподключить».
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}))
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const strip = ({ initial, animate, exit, transition, ...rest }: any) => rest
  const cache: Record<string, any> = {}
  const motion = new Proxy({}, {
    get: (_t, tag: string) => (cache[tag] ||= React.forwardRef((props: any, ref: any) => React.createElement(tag, { ...strip(props), ref }))),
  })
  return { motion, AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children) }
})

import KaspiShopStoreSwitcher from './KaspiShopStoreSwitcher'

type Conn = { id: string; merchantId: string; companyName: string; status: string; isActive: boolean; sessionStatus: string }
const conn = (over: Partial<Conn>): Conn => ({ id: 'c1', merchantId: 'm1', companyName: 'ИП FIRST PROJECT', status: 'connected', isActive: true, sessionStatus: 'active', ...over })

let connections: Conn[]
let switchResult: { status: number; body: any }
let calls: { url: string; method: string; body: any }[]
let root: Root
let host: HTMLDivElement

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  push.mockClear()
  calls = []
  switchResult = { status: 200, body: { ok: true } }
  connections = [
    conn({ id: 'c1', companyName: 'ИП FIRST PROJECT', isActive: true, sessionStatus: 'session_expired' }),
    conn({ id: 'c2', merchantId: 'm2', companyName: 'Abil-Sisters', isActive: false, sessionStatus: 'active' }),
  ]
  globalThis.fetch = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    calls.push({ url, method: (init?.method || 'GET').toUpperCase(), body: init?.body ? JSON.parse(init.body) : undefined })
    if (url === '/api/kaspi-shop/connections') return json(200, { connections })
    if (url === '/api/kaspi-shop/connections/switch') return json(switchResult.status, switchResult.body)
    return json(404, { error: 'unexpected' })
  }) as any
  // полная перезагрузка после переключения не нужна тесту
  Object.defineProperty(window, 'location', { configurable: true, value: { href: '/kaspi-shop/overview' } })
})

afterEach(async () => {
  await act(async () => { root?.unmount() })
  host?.remove()
  document.body.innerHTML = ''
})

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}
async function mount(props: { inSidebar?: boolean } = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(createElement(KaspiShopStoreSwitcher as ComponentType<{ inSidebar?: boolean }>, props)) })
  await flush()
}
async function click(el: Element | null | undefined) {
  if (!el) throw new Error('element not found')
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await flush()
}
const text = () => (document.body.textContent || '').replace(/\s+/g, ' ')
function byText(selector: string, needle: string): HTMLElement | null {
  return (Array.from(document.body.querySelectorAll(selector)) as HTMLElement[]).find(e => (e.textContent || '').includes(needle)) || null
}

describe('активный магазин с истёкшей сессией', () => {
  for (const inSidebar of [false, true]) {
    describe(inSidebar ? 'в боковом меню' : 'в верхней панели', () => {
      it('кнопка называется «Переподключить», а не «Подключить магазин»', async () => {
        await mount({ inSidebar })
        expect(byText('button', 'Переподключить')).toBeTruthy()
        expect(text()).not.toContain('Подключить магазин')
      })

      it('кнопка ведёт в переподключение того же магазина', async () => {
        await mount({ inSidebar })
        await click(byText('button', 'Переподключить'))
        expect(push).toHaveBeenCalledWith('/kaspi-shop?addStore=1')
      })

      it('список магазинов доступен: можно переключиться на здоровый магазин', async () => {
        await mount({ inSidebar })
        await click(document.body.querySelector('button[aria-label="Магазины Kaspi"]'))
        expect(text()).toContain('Магазины Kaspi')
        expect(text()).toContain('Abil-Sisters')
        await click(byText('button', 'Abil-Sisters'))
        const sw = calls.find(c => c.url === '/api/kaspi-shop/connections/switch')
        expect(sw?.method).toBe('POST')
        expect(sw?.body).toEqual({ connectionId: 'c2' })
      })

      it('истёкший магазин помечен в списке', async () => {
        await mount({ inSidebar })
        await click(document.body.querySelector('button[aria-label="Магазины Kaspi"]'))
        expect(text()).toContain('сессия истекла')
      })

      it('«+ Добавить магазин» открывает добавление нового, а не переподключение', async () => {
        await mount({ inSidebar })
        await click(document.body.querySelector('button[aria-label="Магазины Kaspi"]'))
        await click(byText('button', '+ Добавить магазин'))
        expect(push).toHaveBeenCalledWith('/kaspi-shop?addStore=new')
      })
    })
  }

  it('отказ сервера при переключении: причина видна, список остаётся открытым, перехода нет', async () => {
    switchResult = { status: 404, body: { error: 'Магазин не найден' } }
    await mount()
    await click(document.body.querySelector('button[aria-label="Магазины Kaspi"]'))
    await click(byText('button', 'Abil-Sisters'))
    expect(text()).toContain('Магазин не найден')
    expect(text()).toContain('Магазины Kaspi')
    expect((window.location as any).href).toBe('/kaspi-shop/overview')
  })
})

describe('здоровый активный магазин: прежнее поведение', () => {
  beforeEach(() => {
    connections = [
      conn({ id: 'c1', companyName: 'Abil-Sisters', isActive: true, sessionStatus: 'active' }),
      conn({ id: 'c2', merchantId: 'm2', companyName: 'ИП FIRST PROJECT', isActive: false, sessionStatus: 'session_expired' }),
    ]
  })

  it('имя магазина и список, без кнопки «Переподключить»', async () => {
    await mount()
    expect(text()).toContain('Abil-Sisters')
    expect(byText('button', 'Переподключить')).toBeNull()
  })

  it('«+ Добавить магазин» как раньше (?addStore=1)', async () => {
    await mount()
    await click(byText('button', 'Abil-Sisters'))
    await click(byText('button', '+ Добавить магазин'))
    expect(push).toHaveBeenCalledWith('/kaspi-shop?addStore=1')
  })

  it('успешное переключение: запрос и переход на /kaspi-shop', async () => {
    await mount()
    await click(byText('button', 'Abil-Sisters'))
    await click(byText('button', 'ИП FIRST PROJECT'))
    expect(calls.some(c => c.url === '/api/kaspi-shop/connections/switch')).toBe(true)
    expect((window.location as any).href).toBe('/kaspi-shop')
  })
})
