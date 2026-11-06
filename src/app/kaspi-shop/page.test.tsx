// @vitest-environment happy-dom
// Страница «Демпинг» в happy-dom: сохранения, переключатели, сбой запросов,
// стоимость запуска и окно переподключения (аудит Kaspi 2026-11-06: K11, K12, K13,
// K14, K15, K46). Сеть подменена маршрутизатором fetch, всё остальное настоящее.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}))
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
vi.mock('./KaspiTour', () => ({ default: () => null }))
vi.mock('@/components/PageHeader', () => ({
  default: ({ title, right }: any) => createElement('div', null, createElement('h1', null, title), right),
}))
vi.mock('@/components/LanguageProvider', () => ({ useLanguage: () => ({ lang: 'ru' }) }))
vi.mock('@/lib/useCrossHref', () => ({ useCrossHref: () => () => '/dashboard' }))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))

import KaspiShop from './page'

type Calls = { url: string; method: string; body: any }[]

function product(over: Record<string, unknown> = {}) {
  return {
    id: 'p1', kaspi_sku: 'S1', kaspi_master_sku: 'M1', point_city_codes: null, product_name: 'Чехол для телефона',
    brand: '', store_id: 's', stock_count: 0, own_current_price: 1500, floor_price: 1000, max_price: null,
    undercut_step: 100, check_frequency_minutes: 15, enabled: true, last_checked_at: null, last_competitor_price: 1400,
    demping_strategy: 'undercut_leader', excluded_city_codes: [], excluded_merchant_ids: [], market_position: null,
    market_offer_count: null, competitor_snapshot: null, cogs_amount: 700, ...over,
  }
}

type World = {
  products: any[]
  wallet: { status: number; body: any }
  productsStatus: number
  connections: any[]
  patch: (body: any) => { status: number; body: any }
  applyNow: { status: number; body: any }
  suggest: { status: number; body: any }
  calls: Calls
}

let world: World
let root: Root
let host: HTMLDivElement

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function installFetch() {
  globalThis.fetch = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    const method = (init?.method || 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(init.body) : undefined
    world.calls.push({ url, method, body })
    if (url.startsWith('/api/kaspi-shop/products/suggest-pricing')) return json(world.suggest.status, world.suggest.body)
    if (url.startsWith('/api/kaspi-shop/products/city-prices')) return json(200, { cities: [] })
    if (url === '/api/kaspi-shop/products' && method === 'GET') {
      if (world.productsStatus !== 200) return json(world.productsStatus, { error: 'Сбой чтения товаров' })
      const active = world.products.filter(p => p.enabled).length
      return json(200, { products: world.products, stats: { totalRules: world.products.length, activeCount: active, readyToApply: active, blockedAtFloor: 0 } })
    }
    if (url === '/api/kaspi-shop/products' && method === 'PATCH') {
      const r = world.patch(body)
      if (r.status === 200 && body.floor_price !== undefined) {
        world.products = world.products.map(p => (p.id === body.id ? { ...p, floor_price: body.floor_price, max_price: body.max_price, undercut_step: body.undercut_step } : p))
      }
      if (r.status === 200 && body.enabled !== undefined) world.products = world.products.map(p => (p.id === body.id ? { ...p, enabled: body.enabled } : p))
      return json(r.status, r.body)
    }
    if (url === '/api/kaspi-shop/wallet') return json(world.wallet.status, world.wallet.body)
    if (url === '/api/kaspi-shop/settings/cities') return json(200, { cities: [] })
    if (url === '/api/kaspi-shop/connections') return json(200, { connections: world.connections })
    if (url === '/api/kaspi-shop/connections/switch') return json(200, { ok: true })
    if (url === '/api/kaspi-shop/apply-now') return json(world.applyNow.status, world.applyNow.body)
    return json(404, { error: `unexpected ${method} ${url}` })
  }) as any
}

const okWallet = (over: Record<string, unknown> = {}) => ({
  status: 200,
  body: { balance: 5000, connected: true, paused: false, sessionStatus: 'active', companyName: 'Магазин Тест', trackedCityCodes: [], ...over },
})

async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}

async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(createElement(KaspiShop)) })
  await flush()
}

const text = () => (document.body.textContent || '').replace(/[\s  ]+/g, ' ')
const countCalls = (method: string, url: string) => world.calls.filter(c => c.method === method && c.url === url).length

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

function field(labelText: string): HTMLInputElement {
  const label = byText('label', labelText)
  const input = label?.querySelector('input')
  if (!input) throw new Error(`field ${labelText} not found`)
  return input as HTMLInputElement
}

async function openCard() {
  await click(byText('div[role="button"]', 'Чехол для телефона'))
}

beforeEach(() => {
  push.mockClear()
  world = {
    products: [product()], wallet: okWallet(), productsStatus: 200, connections: [],
    patch: () => ({ status: 200, body: { ok: true } }),
    applyNow: { status: 202, body: { ok: true, count: 1, cost: 5 } },
    suggest: { status: 200, body: { floorPrice: 900, undercutStep: 50, reasoning: 'Конкуренты дешевле на 5%.', estimate: true } },
    calls: [],
  }
  installFetch()
})

afterEach(async () => {
  await act(async () => { root?.unmount() })
  host?.remove()
  document.body.innerHTML = ''
})

describe('K12: сбой запросов не выдаётся за «магазин не подключён»', () => {
  it('кошелёк ответил 500: нет окна «Подключите Kaspi Магазин», есть ошибка и «Повторить»', async () => {
    world.wallet = { status: 500, body: { error: 'Не удалось загрузить баланс и подключение. Попробуйте ещё раз.' } }
    await mount()
    expect(text()).not.toContain('Подключите Kaspi Магазин')
    expect(text()).toContain('Не удалось загрузить баланс и подключение')
    expect(byText('button', 'Повторить')).toBeTruthy()
  })

  it('«Повторить» после сбоя загружает страницу', async () => {
    world.wallet = { status: 500, body: { error: 'сбой' } }
    await mount()
    world.wallet = okWallet()
    await click(byText('button', 'Повторить'))
    expect(text()).toContain('Чехол для телефона')
    expect(text()).not.toContain('Подключите Kaspi Магазин')
  })

  it('кошелёк ответил, что магазин не подключён: окно подключения показывается', async () => {
    world.wallet = okWallet({ connected: false, companyName: null })
    await mount()
    expect(text()).toContain('Подключите Kaspi Магазин')
  })

  it('список товаров не пришёл: ошибка с текстом сервера и без надписи «Каталог пуст»', async () => {
    world.productsStatus = 500
    await mount()
    expect(text()).toContain('Сбой чтения товаров')
    expect(text()).not.toContain('Каталог ещё импортируется или пуст')
    expect(byText('button', 'Повторить')).toBeTruthy()
  })
})

describe('K11/K16: сохранение настроек товара', () => {
  it('отказ сервера: панель остаётся открытой, видно сообщение сервера, ничего не закрывается', async () => {
    world.patch = () => ({ status: 400, body: { error: 'max_price должен быть больше floor_price' } })
    await mount()
    await openCard()
    await type(field('Максимальная цена'), '2000')
    await click(byText('button', 'Сохранить'))
    expect(text()).toContain('Настройки демпинга')
    expect(text()).toContain('max_price должен быть больше floor_price')
    expect(countCalls('PATCH', '/api/kaspi-shop/products')).toBe(1)
  })

  it('успех: панель закрывается, список перечитан, форма при повторном открытии из сохранённого', async () => {
    await mount()
    await openCard()
    await type(field('Минимальная цена'), '1 250,5')
    await type(field('Шаг'), '50')
    await click(byText('button', 'Сохранить'))
    const patch = world.calls.find(c => c.method === 'PATCH')!
    expect(patch.body.floor_price).toBe(1250.5)
    expect(patch.body.undercut_step).toBe(50)
    expect(text()).not.toContain('Настройки демпинга')
    await openCard()
    expect(field('Минимальная цена').value).toBe('1250.5')
  })

  it('закрыли панель без сохранения: при повторном открытии правки не выдают себя за сохранённые', async () => {
    await mount()
    await openCard()
    await type(field('Минимальная цена'), '777')
    await click(byText('button', '✕'))
    await openCard()
    expect(field('Минимальная цена').value).toBe('1000')
  })

  it('пустой минимум не уходит как 0: запроса нет, показано что заполнить', async () => {
    await mount()
    await openCard()
    await type(field('Минимальная цена'), '')
    await click(byText('button', 'Сохранить'))
    expect(countCalls('PATCH', '/api/kaspi-shop/products')).toBe(0)
    expect(text()).toContain('Минимальная цена: заполните поле.')
    expect(text()).toContain('Настройки демпинга')
  })

  it('максимум не выше минимума: быстрый отказ без запроса', async () => {
    await mount()
    await openCard()
    await type(field('Максимальная цена'), '900')
    await click(byText('button', 'Сохранить'))
    expect(countCalls('PATCH', '/api/kaspi-shop/products')).toBe(0)
    expect(text()).toContain('Максимальная цена должна быть больше минимальной.')
  })

  it('очищенный максимум уходит как null (осознанная очистка), а не как 0', async () => {
    world.products = [product({ max_price: 5000 })]
    await mount()
    await openCard()
    await type(field('Максимальная цена'), '')
    await click(byText('button', 'Сохранить'))
    expect(world.calls.find(c => c.method === 'PATCH')!.body.max_price).toBeNull()
  })
})

describe('K11: переключатель «Активно / Пауза»', () => {
  it('отказ сервера возвращает прежнее состояние и показывает причину', async () => {
    world.patch = () => ({ status: 403, body: { error: 'Доступно на тарифе Pro' } })
    await mount()
    expect(byText('span', 'Активно')).toBeTruthy()
    await click(byText('span', 'Активно'))
    expect(byText('span', 'Пауза')).toBeNull()
    expect(byText('span', 'Активно')).toBeTruthy()
    expect(text()).toContain('Доступно на тарифе Pro')
  })

  it('успех: переключается и список перечитывается', async () => {
    await mount()
    const before = countCalls('GET', '/api/kaspi-shop/products')
    await click(byText('span', 'Активно'))
    expect(byText('span', 'Пауза')).toBeTruthy()
    expect(countCalls('GET', '/api/kaspi-shop/products')).toBe(before + 1)
  })
})

describe('K13: ИИ-подбор цены', () => {
  it('без себестоимости кнопка неактивна и объясняет почему', async () => {
    world.products = [product({ cogs_amount: null })]
    await mount()
    await openCard()
    expect((byText('button', 'ИИ-подбор цены') as HTMLButtonElement).disabled).toBe(true)
    expect(text()).toContain('Укажите себестоимость')
  })

  it('без цены конкурента кнопка неактивна и объясняет почему', async () => {
    world.products = [product({ last_competitor_price: null })]
    await mount()
    await openCard()
    expect((byText('button', 'ИИ-подбор цены') as HTMLButtonElement).disabled).toBe(true)
    expect(text()).toContain('Пока нет цен конкурентов')
  })

  it('с данными: подставляет числа, показывает доводы и оговорку «это оценка»', async () => {
    await mount()
    await openCard()
    await click(byText('button', 'ИИ-подбор цены'))
    expect(field('Минимальная цена').value).toBe('900')
    expect(text()).toContain('Конкуренты дешевле на 5%.')
    expect(text()).toContain('Это оценка, а не расчёт и не гарантия')
    // подбор ничего не сохраняет сам
    expect(countCalls('PATCH', '/api/kaspi-shop/products')).toBe(0)
  })

  it('ошибка сервера видна, поля не меняются', async () => {
    world.suggest = { status: 502, body: { error: 'ИИ предложил минимальную цену 500 ₸, это ниже себестоимости 700 ₸.' } }
    await mount()
    await openCard()
    await click(byText('button', 'ИИ-подбор цены'))
    expect(text()).toContain('ниже себестоимости')
    expect(field('Минимальная цена').value).toBe('1000')
  })

  it('ответ ниже себестоимости не подставляется даже при ответе 200', async () => {
    world.suggest = { status: 200, body: { floorPrice: 500, undercutStep: 50, reasoning: 'x' } }
    await mount()
    await openCard()
    await click(byText('button', 'ИИ-подбор цены'))
    expect(field('Минимальная цена').value).toBe('1000')
    expect(text()).toContain('ниже себестоимости')
  })
})

describe('K14/K15: стоимость запуска и расход', () => {
  it('на шапке раскрыт реальный расход: 5 ₸, период около 20 минут, сумма в сутки', async () => {
    world.products = [product(), product({ id: 'p2', product_name: 'Кабель' })]
    await mount()
    const hero = text()
    expect(hero).toContain('Каждая проверка цены стоит 5 ₸')
    expect(hero).toContain('около 20 мин')
    // 2 товара × 72 проверки × 5 ₸
    expect(hero).toContain('720 ₸ в сутки на 2 товара')
  })

  it('у «Применить сейчас» видно «N товаров × 5 ₸ = X ₸»', async () => {
    world.products = [product(), product({ id: 'p2', product_name: 'Кабель' })]
    await mount()
    expect(text()).toContain('2 товара × 5 ₸ = 10 ₸')
  })

  it('«Применить сейчас» просит подтверждение; отказ не запускает проверку и не списывает', async () => {
    world.products = [product(), product({ id: 'p2', product_name: 'Кабель' })]
    await mount()
    await click(byText('button', 'Применить сейчас'))
    expect(text()).toContain('2 товара × 5 ₸ = 10 ₸ спишется с баланса')
    await click(byText('button', 'Отмена'))
    expect(countCalls('POST', '/api/kaspi-shop/apply-now')).toBe(0)
  })

  it('после подтверждения: запуск и честный текст о сроках (минуты, а не «в течение минуты»)', async () => {
    world.products = [product(), product({ id: 'p2', product_name: 'Кабель' })]
    world.applyNow = { status: 202, body: { ok: true, count: 2, cost: 10 } }
    await mount()
    await click(byText('button', 'Применить сейчас'))
    await click(byText('button', 'Продолжить'))
    expect(countCalls('POST', '/api/kaspi-shop/apply-now')).toBe(1)
    expect(text()).toContain('Проверка запущена: 2 товара × 5 ₸ = 10 ₸.')
    expect(text()).toContain('несколько минут')
    expect(text()).not.toContain('в течение минуты')
  })

  it('ответ без count и cost не выдумывает цифры', async () => {
    world.applyNow = { status: 202, body: { ok: true } }
    await mount()
    await click(byText('button', 'Применить сейчас'))
    await click(byText('button', 'Продолжить'))
    expect(text()).toContain('Проверка запущена. Цены обновятся не сразу')
  })

  it('отказ сервера (например, кулдаун) показывает его слова', async () => {
    world.applyNow = { status: 429, body: { error: 'Проверку можно запускать раз в 10 минут' } }
    await mount()
    await click(byText('button', 'Применить сейчас'))
    await click(byText('button', 'Продолжить'))
    expect(text()).toContain('Проверку можно запускать раз в 10 минут')
  })

  it('баланса меньше суточного расхода: плашка «Баланс заканчивается» с кнопкой пополнения', async () => {
    world.products = [product()]
    world.wallet = okWallet({ balance: 100 })
    await mount()
    expect(text()).toContain('Баланс заканчивается')
    expect(text()).toContain('Баланса хватит')
  })

  it('пустой баланс: «Бот остановлен»', async () => {
    world.wallet = okWallet({ balance: 0 })
    await mount()
    expect(text()).toContain('Бот остановлен: нет денег на балансе')
  })

  it('денег хватает больше чем на сутки: плашки нет', async () => {
    await mount()
    expect(text()).not.toContain('Баланс заканчивается')
    expect(text()).not.toContain('Бот остановлен')
  })

  it('на паузе (как на скриншоте основателя: 4 товара на паузе) расхода и плашки нет', async () => {
    world.products = [1, 2, 3, 4].map(i => product({ id: `p${i}`, product_name: `Товар ${i}`, enabled: false, own_current_price: i === 4 ? 2000 : 1000, floor_price: i === 4 ? 1500 : 1000 }))
    world.wallet = okWallet({ balance: 0 })
    await mount()
    expect(text()).not.toContain('Бот остановлен')
    expect(text()).not.toContain('Каждая проверка цены стоит')
    expect(text()).toContain('Минимальная цена не задана у 3 товаров из 4')
  })

  it('окно «Добавить несколько» показывает расход на выбранные товары', async () => {
    world.products = [product({ enabled: false }), product({ id: 'p2', product_name: 'Кабель', enabled: false })]
    await mount()
    await click(byText('button', 'Добавить несколько'))
    await click(byText('button', 'Чехол для телефона'))
    await click(byText('button', 'Кабель'))
    await click(byText('button', 'Далее'))
    const box = document.body.querySelector('[data-testid="bulk-cost"]')
    expect(box?.textContent).toContain('2 товара × 5 ₸ за проверку')
    expect(box?.textContent).toContain('720 ₸ в сутки')
    expect(box?.textContent).toContain('около 20 мин')
  })
})

describe('K46: истёкшая сессия активного магазина', () => {
  const expired = () => okWallet({ sessionStatus: 'session_expired' })

  it('без других магазинов окно переподключения не закрывается', async () => {
    world.wallet = expired()
    world.connections = [{ id: 'c1', companyName: 'Магазин Тест', isActive: true, sessionStatus: 'session_expired' }]
    await mount()
    expect(text()).toContain('Сессия истекла')
    expect(byText('button', '✕')).toBeNull()
  })

  it('при втором магазине в окне можно перейти в него и можно закрыть окно', async () => {
    world.wallet = expired()
    world.connections = [
      { id: 'c1', companyName: 'Магазин Тест', isActive: true, sessionStatus: 'session_expired' },
      { id: 'c2', companyName: 'Второй магазин', isActive: false, sessionStatus: 'active' },
    ]
    await mount()
    expect(text()).toContain('Или откройте другой магазин')
    expect(byText('button', 'Второй магазин')).toBeTruthy()
    expect(document.body.querySelector('button[aria-label="Закрыть"]')).toBeTruthy()
    await click(document.body.querySelector('button[aria-label="Закрыть"]'))
    expect(text()).toContain('Сессия магазина «Магазин Тест» истекла')
    expect(text()).not.toContain('Подключение')
    expect(byText('button', 'Переподключить')).toBeTruthy()
    expect(byText('button', 'Открыть «Второй магазин»')).toBeTruthy()
    // данные истёкшего магазина по-прежнему скрыты (решение основателя 03.09.2026)
    expect(text()).not.toContain('Чехол для телефона')
  })
})
