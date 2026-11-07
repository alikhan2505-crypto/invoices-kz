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
  sync: { status: number; body: any }
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
      // как на сервере: «Активных» = включённые и в продаже (снятые с продажи не считаются)
      const active = world.products.filter(p => p.enabled && p.available_for_sale !== false).length
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
    if (url === '/api/kaspi-shop/catalog/sync') return json(world.sync.status, world.sync.body)
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
    applyNow: { status: 202, body: { ok: true, count: 1, queued: 1 } },
    suggest: { status: 200, body: { floorPrice: 900, undercutStep: 50, reasoning: 'Конкуренты дешевле на 5%.', estimate: true } },
    sync: { status: 200, body: { ok: true, imported: 3, total: 3 } },
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

// Текст карточки статистики целиком («2Активных»): ищем элемент, чей текст ровно подпись.
const statCard = (label: string) => (Array.from(document.body.querySelectorAll('div')).find(e => e.textContent === label)?.parentElement?.textContent) || ''

const NOTE = 'Проверки бесплатны, 5 ₸ списывается только за каждое изменение цены ботом.'

describe('модель списаний 07.11.2026: проверки бесплатны, 5 ₸ за изменение цены', () => {
  it('на шапке: одна фраза про модель, период «примерно», никаких «5 ₸ за проверку» и сумм в сутки', async () => {
    world.products = [product(), product({ id: 'p2', product_name: 'Кабель' })]
    await mount()
    const hero = document.body.querySelector('[data-testid="running-cost"]')?.textContent || ''
    expect(hero).toContain(NOTE)
    expect(hero).toContain('не больше 5 ₸')
    // в фикстуре частота 15: на деле второй запуск, то есть 20 минут
    expect(hero).toContain('примерно раз в 20 мин')
    expect(text()).not.toContain('Каждая проверка цены стоит')
    expect(text()).not.toContain('в сутки')
    expect(text()).not.toContain('Ориентировочно')
    expect(text()).not.toContain('за проверку')
  })

  it('частота нового товара по умолчанию в окне «Добавить несколько» — 60, и подпись говорит «раз в 60 мин»', async () => {
    world.products = [product({ enabled: false }), product({ id: 'p2', product_name: 'Кабель', enabled: false })]
    await mount()
    await click(byText('button', 'Добавить несколько'))
    await click(byText('button', 'Чехол для телефона'))
    await click(byText('button', 'Кабель'))
    await click(byText('button', 'Далее'))
    expect(field('Частота проверки').value).toBe('60')
    const box = document.body.querySelector('[data-testid="bulk-cost"]')
    expect(box?.textContent).toContain(NOTE)
    expect(box?.textContent).toContain('2 товара: бот проверяет цены примерно раз в 60 мин')
    expect(box?.textContent).not.toContain('в сутки')
    expect(box?.textContent).not.toContain('× 5')
    expect(box?.textContent).not.toContain('70')
  })

  it('«Применить сейчас» не показывает стоимости и не просит подтверждения: запуск сразу', async () => {
    world.products = [product(), product({ id: 'p2', product_name: 'Кабель' })]
    world.applyNow = { status: 202, body: { ok: true, count: 2, queued: 2 } }
    await mount()
    expect(text()).not.toContain('× 5 ₸')
    expect(document.body.querySelector('[data-testid="apply-now-reason"]')).toBeNull()
    await click(byText('button', 'Применить сейчас'))
    expect(countCalls('POST', '/api/kaspi-shop/apply-now')).toBe(1)
    expect(byText('button', 'Продолжить')).toBeNull()
    expect(text()).not.toContain('спишется с баланса')
  })

  it('после запуска: «Проверка запущена», честно про минуты и про то, что 5 ₸ берётся только за изменение цены', async () => {
    world.products = [product(), product({ id: 'p2', product_name: 'Кабель' })]
    world.applyNow = { status: 202, body: { ok: true, count: 2, queued: 2 } }
    await mount()
    await click(byText('button', 'Применить сейчас'))
    expect(text()).toContain('Проверка запущена: 2 товара.')
    expect(text()).toContain('несколько минут')
    expect(text()).toContain(NOTE)
    expect(text()).not.toContain('× 5 ₸')
    expect(text()).not.toContain('в течение минуты')
  })

  it('ответ без count не выдумывает цифры', async () => {
    world.applyNow = { status: 202, body: { ok: true } }
    await mount()
    await click(byText('button', 'Применить сейчас'))
    expect(text()).toContain('Проверка запущена. Цены обновятся не сразу')
  })

  it('отказ сервера (например, кулдаун) показывает его слова', async () => {
    world.applyNow = { status: 429, body: { error: 'Проверку можно запускать раз в 10 минут' } }
    await mount()
    await click(byText('button', 'Применить сейчас'))
    expect(text()).toContain('Проверку можно запускать раз в 10 минут')
  })

  it('баланс меньше 5 ₸: плашка «Баланс меньше 5 ₸: бот не сможет менять цены» с кнопкой пополнения', async () => {
    world.products = [product()]
    world.wallet = okWallet({ balance: 4 })
    await mount()
    const alert = document.body.querySelector('[role="alert"]')?.textContent || ''
    expect(alert).toContain('Баланс меньше 5 ₸: бот не сможет менять цены')
    expect(alert).toContain(NOTE)
    expect(alert).toContain('Пополнить баланс')
    expect(text()).not.toContain('Бот остановлен')
    expect(text()).not.toContain('Баланс заканчивается')
  })

  it('пустой баланс: та же плашка, а «Применить сейчас» недоступна и объясняет почему', async () => {
    world.wallet = okWallet({ balance: 0 })
    await mount()
    expect(text()).toContain('Баланс меньше 5 ₸: бот не сможет менять цены')
    expect((byText('button', 'Применить сейчас') as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.querySelector('[data-testid="apply-now-reason"]')?.textContent).toContain('Баланс меньше 5 ₸')
  })

  it('ровно 5 ₸ и больше (в том числе 100 ₸): плашки нет, прежних «хватит на N часов» тоже', async () => {
    for (const balance of [5, 100, 5000]) {
      document.body.innerHTML = ''
      world.wallet = okWallet({ balance })
      await mount()
      expect(text()).not.toContain('Баланс меньше 5 ₸')
      expect(text()).not.toContain('Баланса хватит')
      expect(text()).not.toContain('Баланс заканчивается')
      expect((byText('button', 'Применить сейчас') as HTMLButtonElement).disabled).toBe(false)
      await act(async () => { root?.unmount() })
      host?.remove()
    }
  })

  it('на паузе (как на скриншоте основателя: 4 товара на паузе) плашки нет', async () => {
    world.products = [1, 2, 3, 4].map(i => product({ id: `p${i}`, product_name: `Товар ${i}`, enabled: false, own_current_price: i === 4 ? 2000 : 1000, floor_price: i === 4 ? 1500 : 1000 }))
    world.wallet = okWallet({ balance: 0 })
    await mount()
    expect(text()).not.toContain('Баланс меньше 5 ₸')
    expect(text()).not.toContain(NOTE)
    expect(text()).toContain('Минимальная цена не задана у 3 товаров из 4')
  })

  it('кошелёк в окне пополнения: «5 ₸ за каждое изменение цены ботом», а не «проверка цены — 5 ₸»', async () => {
    await mount()
    await click(byText('button', 'пополнить'))
    expect(text()).toContain('5 ₸ за каждое изменение цены ботом')
    expect(text()).not.toContain('проверка цены — 5 ₸')
  })
})

describe('ui2: снятые с продажи и пауза', () => {
  const mixed = () => [
    product(),
    product({ id: 'p2', product_name: 'Кабель' }),
    product({ id: 'p3', product_name: 'Чехол снятый', available_for_sale: false }),
  ]

  it('«Активных» и шапка считают только включённые товары в продаже (2 из 3), «Применить сейчас» сообщает то же число', async () => {
    world.products = mixed()
    world.applyNow = { status: 202, body: { ok: true, count: 2, queued: 2 } }
    await mount()
    const card = statCard('Активных') || ''
    expect(card).toBe('2Активных')
    expect(document.body.querySelector('[data-testid="running-cost"]')?.textContent).toContain(NOTE)
    await click(byText('button', 'Применить сейчас'))
    expect(text()).toContain('Проверка запущена: 2 товара.')
  })

  it('все включённые сняты с продажи: «Активных» 0, плашки нет, «Применить сейчас» недоступна и называет причину', async () => {
    world.products = [product({ available_for_sale: false })]
    world.wallet = okWallet({ balance: 0 })
    await mount()
    expect(text()).not.toContain('Баланс меньше 5 ₸')
    expect(statCard('Активных')).toBe('0Активных')
    expect(text()).toContain('Нет активных товаров')
    expect((byText('button', 'Применить сейчас') as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.querySelector('[data-testid="apply-now-reason"]')?.textContent).toContain('Нет включённых товаров в продаже')
  })

  it('на паузе при включённых товарах: «Применить сейчас» недоступна с причиной; строка расхода говорит «не списывается»', async () => {
    world.wallet = okWallet({ paused: true })
    await mount()
    const hero = document.body.querySelector('[data-testid="running-cost"]')?.textContent || ''
    expect(hero).toContain('на паузе')
    expect(hero).toContain('деньги не списываются')
    expect(hero).not.toContain(NOTE)
    expect((byText('button', 'Применить сейчас') as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.querySelector('[data-testid="apply-now-reason"]')?.textContent).toContain('Демпинг на паузе')
    await click(byText('button', 'Применить сейчас'))
    expect(countCalls('POST', '/api/kaspi-shop/apply-now')).toBe(0)
  })
})

describe('ui2: минимум сильно выше цены', () => {
  const far = { status: 400, body: { error: 'Минимум 60000 выше цены', code: 'floor_far_above_price', field: 'floor_price', floorPrice: 60000, ownPrice: 1500, factor: 3 } }

  it('400 с кодом открывает подтверждение с числами; «Сохранить» повторяет запрос с confirmFloor: true', async () => {
    world.patch = body => (body.confirmFloor ? { status: 200, body: { ok: true } } : far)
    await mount()
    await openCard()
    await type(field('Минимальная цена'), '60000')
    await click(byText('button', 'Сохранить'))
    expect(text()).toContain('Минимум 60')
    expect(text()).toContain('выше текущей цены 1')
    expect(text()).toContain('более чем в 3 раза. Бот сделает это при следующей проверке, если товар включён')
    expect(text()).toContain('цена поднимется до минимума, за это изменение спишется 5 ₸. Сохранить?')
    expect(text()).not.toContain('Цена сразу')
    expect(countCalls('PATCH', '/api/kaspi-shop/products')).toBe(1)
    await click(byText('button', 'Продолжить'))
    const patches = world.calls.filter(c => c.method === 'PATCH')
    expect(patches).toHaveLength(2)
    expect(patches[0].body.confirmFloor).toBeUndefined()
    expect(patches[1].body.confirmFloor).toBe(true)
    expect(patches[1].body.floor_price).toBe(60000)
    expect(text()).not.toContain('Настройки демпинга')
  })

  it('отказ в подтверждении: второго запроса нет, панель открыта с пояснением', async () => {
    world.patch = () => far
    await mount()
    await openCard()
    await type(field('Минимальная цена'), '60000')
    await click(byText('button', 'Сохранить'))
    await click(byText('button', 'Отмена'))
    expect(countCalls('PATCH', '/api/kaspi-shop/products')).toBe(1)
    expect(text()).toContain('Настройки демпинга')
    expect(text()).toContain('Настройки не сохранены')
  })
})

describe('ui2: «Обновить каталог» при неполном ответе', () => {
  it('502 с partial и imported > 0: список перечитан, сообщение сервера показано', async () => {
    world.sync = { status: 502, body: { error: 'Обновлено 200 товар(ов), остальные не обновлены (Kaspi ответил HTTP 500). Повторите через минуту.', imported: 200, total: 0, partial: true } }
    await mount()
    const before = countCalls('GET', '/api/kaspi-shop/products')
    await click(byText('button', 'Обновить каталог'))
    expect(countCalls('GET', '/api/kaspi-shop/products')).toBe(before + 1)
    expect(text()).toContain('Обновлено 200 товар(ов), остальные не обновлены')
  })

  it('502 без записанных товаров: список не перечитывается', async () => {
    world.sync = { status: 502, body: { error: 'Каталог не обновлён. Повторите через минуту.', imported: 0, total: 0, partial: true } }
    await mount()
    const before = countCalls('GET', '/api/kaspi-shop/products')
    await click(byText('button', 'Обновить каталог'))
    expect(countCalls('GET', '/api/kaspi-shop/products')).toBe(before)
    expect(text()).toContain('Каталог не обновлён')
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
