// @vitest-environment happy-dom
// «Управление товарами»: модалка «Цена и остатки» (K24) и сбой запроса кошелька (K12).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

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
vi.mock('@/components/PageHeader', () => ({
  default: ({ title, right }: any) => createElement('div', null, createElement('h1', null, title), right),
}))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))

import RemovedPage from './page'

type Call = { url: string; method: string; body: any }

const entry = (storeCode: string, cityId: string, cityName: string, price: number, stockCount: number | null = 5) =>
  ({ storeCode, cityId, cityName, price, stockCount, available: 'yes' })

let world: {
  wallet: { status: number; body: any }
  entries: any[]
  postResult: { status: number; body: any }
  calls: Call[]
}
let root: Root
let host: HTMLDivElement

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function installFetch() {
  globalThis.fetch = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    const method = (init?.method || 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(init.body) : undefined
    world.calls.push({ url, method, body })
    if (url === '/api/kaspi-shop/wallet') return json(world.wallet.status, world.wallet.body)
    if (url === '/api/kaspi-shop/removed-products') {
      return json(200, { active: [{ sku: 'SKU1', masterSku: 'M1', title: 'Чехол для телефона', brandName: null, minPrice: 1200, points: [] }], removed: [] })
    }
    if (url.startsWith('/api/kaspi-shop/offer-stocks') && method === 'GET') {
      return json(200, { sku: 'SKU1', masterSku: 'M1', model: 'Чехол для телефона', minPrice: 1200, entries: world.entries })
    }
    if (url === '/api/kaspi-shop/offer-stocks' && method === 'POST') return json(world.postResult.status, world.postResult.body)
    return json(404, { error: `unexpected ${method} ${url}` })
  }) as any
}

async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}
async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(createElement(RemovedPage)) })
  await flush()
}
const text = () => (document.body.textContent || '').replace(/[\s  ]+/g, ' ')
async function click(el: Element | null | undefined) {
  if (!el) throw new Error('element not found')
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await flush()
}
async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function byText(selector: string, needle: string): HTMLElement | null {
  return (Array.from(document.body.querySelectorAll(selector)) as HTMLElement[]).find(e => (e.textContent || '').includes(needle)) || null
}
// Поле цены/остатка точки: блок точки находим по подписи «город · код».
function pointInputs(label: string): { price: HTMLInputElement; stock: HTMLInputElement } {
  const block = (Array.from(document.body.querySelectorAll('div.rounded-xl')) as HTMLElement[])
    .find(d => (d.querySelector('.text-xs.font-semibold')?.textContent || '').includes(label))
  if (!block) throw new Error(`point ${label} not found`)
  const inputs = block.querySelectorAll('input')
  return { price: inputs[0] as HTMLInputElement, stock: inputs[1] as HTMLInputElement }
}
async function openModal() {
  await click(document.body.querySelector('div[title="Чехол для телефона"]'))
}
const posts = () => world.calls.filter(c => c.method === 'POST' && c.url === '/api/kaspi-shop/offer-stocks')

beforeEach(() => {
  push.mockClear()
  world = {
    wallet: { status: 200, body: { connected: true, sessionStatus: 'active', balance: 0 } },
    entries: [entry('PP1', 'ALM', 'Алматы', 1200), entry('PP2', 'ALM', 'Алматы', 1200), entry('PP3', 'AST', 'Астана', 1300)],
    postResult: { status: 200, body: { ok: true, results: [] } },
    calls: [],
  }
  installFetch()
})

afterEach(async () => {
  await act(async () => { root?.unmount() })
  host?.remove()
  document.body.innerHTML = ''
})

describe('K12: сбой запроса кошелька не выгоняет подключённого продавца на окно подключения', () => {
  it('кошелёк ответил 500: нет перехода на /kaspi-shop, виден текст ошибки', async () => {
    world.wallet = { status: 500, body: { error: 'Не удалось загрузить баланс и подключение. Попробуйте ещё раз.' } }
    await mount()
    expect(push).not.toHaveBeenCalled()
    expect(text()).toContain('Не удалось загрузить баланс и подключение')
  })

  it('действительно «не подключён»: переход на /kaspi-shop сохраняется', async () => {
    world.wallet = { status: 200, body: { connected: false } }
    await mount()
    expect(push).toHaveBeenCalledWith('/kaspi-shop')
  })

  it('истёкшая сессия: переход на /kaspi-shop сохраняется', async () => {
    world.wallet = { status: 200, body: { connected: true, sessionStatus: 'session_expired' } }
    await mount()
    expect(push).toHaveBeenCalledWith('/kaspi-shop')
  })
})

describe('K24: «Цена и остатки» сохраняет по городам и только изменённое', () => {
  it('PP1 -> 1500, PP2 в том же городе не тронута: уходит одна запись PP1, PP2 не откатывает цену', async () => {
    await mount()
    await openModal()
    await type(pointInputs('PP1').price, '1500')
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()).toHaveLength(1)
    expect(posts()[0].body.entries).toEqual([{ storeCode: 'PP1', cityId: 'ALM', price: 1500, stockCount: 5 }])
    expect(text()).toContain('Отправлено')
  })

  it('вторая правка в окне автозакрытия сравнивается с уже сохранённым: PP1 заново не уходит', async () => {
    await mount()
    await openModal()
    await type(pointInputs('PP1').price, '1500')
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()).toHaveLength(1)
    expect(text()).toContain('Отправлено')
    // окно ещё открыто (автозакрытие через 2 с): правим остаток у PP3 другого города
    await type(pointInputs('PP3').stock, '9')
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()).toHaveLength(2)
    expect(posts()[1].body.entries).toEqual([{ storeCode: 'PP3', cityId: 'AST', price: 1300, stockCount: 9 }])
  })

  it('после сохранения цены города правка остатка соседней точки уходит с новой ценой города, а не откатывает её', async () => {
    await mount()
    await openModal()
    await type(pointInputs('PP1').price, '1500')
    await click(byText('button', 'Сохранить изменения'))
    await type(pointInputs('PP2').stock, '9')
    expect(pointInputs('PP2').price.value).toBe('1500')
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()).toHaveLength(2)
    expect(posts()[1].body.entries).toEqual([{ storeCode: 'PP2', cityId: 'ALM', price: 1500, stockCount: 9 }])
  })

  it('ничего не меняли: запроса нет, сказано почему', async () => {
    await mount()
    await openModal()
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()).toHaveLength(0)
    expect(text()).toContain('Вы ничего не изменили')
  })

  it('PP1 и PP2 одного города с разными новыми ценами: запрос не уходит, ошибка называет город', async () => {
    await mount()
    await openModal()
    await type(pointInputs('PP1').price, '1500')
    await type(pointInputs('PP2').price, '1400')
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()).toHaveLength(0)
    expect(text()).toContain('Алматы')
    expect(text()).toContain('разные новые цены')
  })

  it('пока человек правит, разные цены в одном городе дают предупреждение', async () => {
    await mount()
    await openModal()
    expect(document.body.querySelector('[data-testid="city-price-warning"]')).toBeNull()
    await type(pointInputs('PP1').price, '1500')
    const warn = document.body.querySelector('[data-testid="city-price-warning"]')
    expect(warn?.textContent).toContain('Алматы')
    expect(warn?.textContent).toContain('в Kaspi цена одна на весь город')
  })

  it('цена PP1 изменена, у PP2 только остаток: обе точки уходят с одной новой ценой', async () => {
    await mount()
    await openModal()
    await type(pointInputs('PP1').price, '1500')
    await type(pointInputs('PP2').price, '1500')
    await type(pointInputs('PP2').stock, '9')
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()[0].body.entries).toEqual([
      { storeCode: 'PP1', cityId: 'ALM', price: 1500, stockCount: 5 },
      { storeCode: 'PP2', cityId: 'ALM', price: 1500, stockCount: 9 },
    ])
  })

  it('запятая и пробелы в цене понимаются; пустая цена не уходит нулём', async () => {
    await mount()
    await openModal()
    await type(pointInputs('PP3').price, '1 250,5')
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()[0].body.entries).toEqual([{ storeCode: 'PP3', cityId: 'AST', price: 1250.5, stockCount: 5 }])
    await type(pointInputs('PP3').price, '')
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()).toHaveLength(1)
    expect(text()).toContain('заполните поле')
  })

  it('отказ сервера по точке: сообщение видно, окно остаётся', async () => {
    world.postResult = { status: 200, body: { ok: false, results: [{ storeCode: 'PP1', ok: false, message: 'валидация Kaspi: цена вне диапазона' }] } }
    await mount()
    await openModal()
    await type(pointInputs('PP1').price, '1500')
    await click(byText('button', 'Сохранить изменения'))
    expect(text()).toContain('PP1: валидация Kaspi: цена вне диапазона')
    expect(text()).not.toContain('Отправлено')
  })

  it('частичное сохранение: упавшая точка остаётся изменённой, сохранённая заново не уходит', async () => {
    world.postResult = { status: 200, body: { ok: false, results: [
      { storeCode: 'PP1', ok: true },
      { storeCode: 'PP3', ok: false, message: 'валидация Kaspi: цена вне диапазона' },
    ] } }
    await mount()
    await openModal()
    await type(pointInputs('PP1').price, '1500')
    await type(pointInputs('PP3').price, '1400')
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()).toHaveLength(1)
    expect(posts()[0].body.entries.map((e: any) => e.storeCode)).toEqual(['PP1', 'PP3'])
    expect(text()).toContain('PP3: валидация Kaspi: цена вне диапазона')
    expect(text()).toContain('Сохранено точек: 1 из 2')
    expect(text()).not.toContain('Отправлено')
    // поля упавшей точки сохранили правку
    expect(pointInputs('PP3').price.value).toBe('1400')
    // повтор: уходит только PP3
    world.postResult = { status: 200, body: { ok: true, results: [{ storeCode: 'PP3', ok: true }] } }
    await click(byText('button', 'Сохранить изменения'))
    expect(posts()).toHaveLength(2)
    expect(posts()[1].body.entries).toEqual([{ storeCode: 'PP3', cityId: 'AST', price: 1400, stockCount: 5 }])
  })

  it('частичное сохранение: окно не закрывается само, сосед сохранённого города получает новую цену города', async () => {
    world.postResult = { status: 200, body: { ok: false, results: [
      { storeCode: 'PP1', ok: true },
      { storeCode: 'PP3', ok: false, message: 'сбой' },
    ] } }
    await mount()
    await openModal()
    await type(pointInputs('PP1').price, '1500')
    await type(pointInputs('PP3').price, '1400')
    await click(byText('button', 'Сохранить изменения'))
    expect(pointInputs('PP2').price.value).toBe('1500')
  })
})
