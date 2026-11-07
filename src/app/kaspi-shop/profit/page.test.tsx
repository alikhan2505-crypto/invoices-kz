// @vitest-environment happy-dom
// Прибыль: ввод с запятой и пробелами, NaN не стирает значение (K34); сбой Kaspi это
// баннер и «—», а не 0 ₸ и «продаж нет» (K35); заголовок честно «до доставки и налогов»
// и «предварительно» (K33).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { json, mountPage, unmountPage, pageText, byText, click, typeInto, flush } from '@/lib/kaspiShop/pageTestKit'

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
  default: ({ title, right }: any) => createElement('div', null, createElement('h1', null, title), right),
}))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))

import ProfitPage from './page'

const product = (o: any = {}) => ({
  kaspiMasterSku: 'M1', trackedProductId: 't1', productName: 'Чехол', imageUrl: null, unitsSold: 2, revenue: 2000,
  cogsAmount: null, cogsTotal: null, commissionCategoryLabel: null, commissionRatePercent: null, commissionSource: null,
  commissionAmount: null, profit: null, ...o,
})
const summary = (o: any = {}) => ({
  products: [product()], totalRevenue: 2000, totalCogsKnown: 0, productsWithoutCogsCount: 1, adSpend: 0, otherExpenses: 0,
  adSpendConfigured: false, commissionRatePercent: null, commissionAmount: 0, commissionMissing: true, netProfit: 2000,
  isPreliminary: true, truncated: false, sessionExpired: false, upstreamFailed: false, periodFrom: '2026-10-08',
  fetchedOrders: 2, newestFirst: true, ...o,
})

let world: {
  summary: any
  calls: Array<{ url: string; method: string; body: any }>
  patchStatus: number
  wallet: () => Response
  // Запрос с этим фрагментом в адресе ждёт промиса: «медленный ответ на прошлый период».
  hold?: { match: string; gate: Promise<void>; summary: any }
}
function installFetch() {
  globalThis.fetch = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    const method = (init?.method || 'GET').toUpperCase()
    world.calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined })
    if (url === '/api/kaspi-shop/wallet') return world.wallet()
    if (url.startsWith('/api/kaspi-shop/profit?')) {
      if (world.hold && url.includes(world.hold.match)) { await world.hold.gate; return json(200, world.hold.summary) }
      return json(200, world.summary)
    }
    if (method === 'PATCH') return json(world.patchStatus, world.patchStatus === 200 ? { ok: true } : { error: 'x' })
    return json(404, { error: `unexpected ${url}` })
  }) as any
}
const patches = () => world.calls.filter(c => c.method === 'PATCH')

beforeEach(() => {
  world = { summary: summary(), calls: [], patchStatus: 200, wallet: () => json(200, { connected: true, sessionStatus: 'active' }) }
  installFetch()
  push.mockReset()
})
afterEach(async () => { await unmountPage() })

function cogsInput() {
  return document.body.querySelector('input[placeholder="₸"]') as HTMLInputElement
}
async function saveCogs() {
  const btn = cogsInput().parentElement!.querySelector('button')
  await click(btn)
}

describe('страница Прибыль: ввод (K34)', () => {
  it('себестоимость «1250,50» уходит числом 1250.5, а не NaN/null', async () => {
    await mountPage(ProfitPage)
    await typeInto(cogsInput(), '1250,50')
    await saveCogs()
    expect(patches()).toHaveLength(1)
    expect(patches()[0].body).toEqual({ kaspiMasterSku: 'M1', cogsAmount: 1250.5 })
  })

  it('«1 250» с пробелом тоже разбирается', async () => {
    await mountPage(ProfitPage)
    await typeInto(cogsInput(), '1 250')
    await saveCogs()
    expect(patches()[0].body.cogsAmount).toBe(1250)
  })

  it('нечисловой ввод показывает ошибку под полем и вообще не шлёт запрос (раньше null стирал значение)', async () => {
    await mountPage(ProfitPage)
    await typeInto(cogsInput(), 'abc')
    await saveCogs()
    expect(patches()).toHaveLength(0)
    expect(pageText()).toContain('Себестоимость: введите число')
  })

  it('пустое поле осознанно очищает значение (null)', async () => {
    world.summary = summary({ products: [product({ cogsAmount: 300, cogsTotal: 600, profit: 1400 })] })
    await mountPage(ProfitPage)
    await typeInto(cogsInput(), '')
    await saveCogs()
    expect(patches()[0].body).toEqual({ kaspiMasterSku: 'M1', cogsAmount: null })
  })

  it('комиссия «12,5» уходит как 12.5, а «abc» ошибка без запроса', async () => {
    await mountPage(ProfitPage)
    const input = document.body.querySelector('input[placeholder="%"]') as HTMLInputElement
    await typeInto(input, 'abc')
    await click(input.parentElement!.querySelector('button'))
    expect(patches()).toHaveLength(0)
    expect(pageText()).toContain('Комиссия: введите число')
    await typeInto(input, '12,5')
    await click(input.parentElement!.querySelector('button'))
    expect(patches()[0].body).toEqual({ commissionRatePercent: 12.5 })
  })

  it('расходы: «12 500,5» разбирается, мусор в рекламе это ошибка в окне без запроса', async () => {
    await mountPage(ProfitPage)
    await click(byText('button', 'изменить'))
    const inputs = Array.from(document.body.querySelectorAll('input[inputmode="decimal"]')).filter(i => (i as HTMLInputElement).placeholder === '0') as HTMLInputElement[]
    await typeInto(inputs[0], 'abc')
    await click(byText('button', 'Сохранить'))
    expect(patches()).toHaveLength(0)
    expect(pageText()).toContain('Реклама: введите число')
    await typeInto(inputs[0], '12 500,5')
    await click(byText('button', 'Сохранить'))
    expect(patches()[0].body).toEqual({ days: 30, amount: 12500.5, otherAmount: 0 })
  })
})

describe('страница Прибыль: сбой Kaspi и честные подписи (K33, K35)', () => {
  it('K35: сбой на первой странице заказов это баннер и «—», а не 0 ₸ и «За этот период продаж нет»', async () => {
    world.summary = summary({ products: [], totalRevenue: 0, productsWithoutCogsCount: 0, netProfit: 0, upstreamFailed: true, isPreliminary: true })
    await mountPage(ProfitPage)
    const text = pageText()
    expect(text).toContain('Kaspi не ответил на часть запросов')
    expect(text).toContain('выручка и прибыль неизвестны')
    expect(text).not.toContain('За этот период продаж нет')
    expect(text).not.toMatch(/^0 ₸ прибыль/)
    expect(byText('button', 'Повторить')).not.toBeNull()
    // в заголовке вместо числа тире
    expect(document.body.textContent).toContain('—')
  })

  it('K35: сбой на середине листания оставляет набранное, но называет его неполным', async () => {
    world.summary = summary({ upstreamFailed: true, totalRevenue: 2000 })
    await mountPage(ProfitPage)
    expect(pageText()).toContain('выручка и прибыль неполные')
    expect(pageText()).toContain('Kaspi не ответил на часть запросов')
  })

  it('K33: заголовок «до доставки и налогов» и «предварительно», если не указана комиссия', async () => {
    await mountPage(ProfitPage)
    const text = pageText()
    expect(text).toContain('прибыль до доставки и налогов')
    // Без комиссии крупной цифры прибыли нет (она была бы завышена): прочерк и просьба указать комиссию.
    expect(text).toContain('— ₸ прибыль до доставки и налогов')
    expect(text).toContain('Укажите комиссию Kaspi')
    expect(text).toContain('Доставка Kaspi, налоги, возвраты и отмены не вычтены')
  })

  it('K33: когда всё задано и заказы загружены, «предварительно» нет', async () => {
    world.summary = summary({
      productsWithoutCogsCount: 0, commissionMissing: false, isPreliminary: false, commissionRatePercent: 10, commissionAmount: 200, netProfit: 1000,
      products: [product({ cogsAmount: 400, cogsTotal: 800, commissionRatePercent: 10, commissionSource: 'flat', commissionAmount: 200, profit: 1000 })],
    })
    await mountPage(ProfitPage)
    expect(pageText()).toContain('прибыль до доставки и налогов')
    expect(pageText()).not.toContain('(предварительно)')
  })

  it('K32: у товара без категории с общей ставкой карточка показывает вычтенную комиссию', async () => {
    world.summary = summary({
      productsWithoutCogsCount: 0, commissionMissing: false, isPreliminary: false, commissionRatePercent: 10, commissionAmount: 200, netProfit: 1000,
      products: [product({ cogsAmount: 400, cogsTotal: 800, commissionRatePercent: 10, commissionSource: 'flat', commissionAmount: 200, profit: 1000 })],
    })
    await mountPage(ProfitPage)
    expect(pageText()).toContain('−200 ₸ комиссия')
  })

  it('K33: неполный список заказов объяснён по-честному', async () => {
    world.summary = summary({ truncated: true, newestFirst: false, isPreliminary: true })
    await mountPage(ProfitPage)
    expect(pageText()).toContain('Kaspi отдаёт заказы не от новых к старым')
  })

  it('честно пустой период говорит «За этот период продаж нет»', async () => {
    world.summary = summary({ products: [], totalRevenue: 0, productsWithoutCogsCount: 0, commissionMissing: false, isPreliminary: false, netProfit: 0 })
    await mountPage(ProfitPage)
    expect(pageText()).toContain('За этот период продаж нет')
  })

  it('устаревший ответ не затирает сводку: 90 дн., затем 7 дн., медленный ответ на 90 приходит последним', async () => {
    let release!: () => void
    world.hold = { match: 'days=90', gate: new Promise<void>(r => { release = r }), summary: summary({ totalRevenue: 9999000 }) }
    world.summary = summary({ totalRevenue: 777000 })
    await mountPage(ProfitPage)
    await click(byText('button', '90 дн.'))
    await click(byText('button', '7 дн.'))
    expect(pageText().replace(/\s/g, '')).toContain('777000')
    await act(async () => { release() })
    await flush()
    const text = pageText().replace(/\s/g, '')
    expect(text).toContain('777000')
    expect(text).not.toContain('9999000')
  })

  it('K12: сбой запроса подключения (500) показывает «Повторить», а не уводит на /kaspi-shop', async () => {
    world.wallet = () => json(500, { error: 'Сервис временно недоступен' })
    await mountPage(ProfitPage)
    expect(push).not.toHaveBeenCalled()
    expect(byText('button', 'Повторить')).not.toBeNull()
    world.wallet = () => json(200, { connected: true, sessionStatus: 'active' })
    await click(byText('button', 'Повторить'))
    expect(push).not.toHaveBeenCalled()
    expect(world.calls.some(c => c.url.startsWith('/api/kaspi-shop/profit?'))).toBe(true)
  })

  it('K12: честно не подключённый магазин по-прежнему уводит на /kaspi-shop', async () => {
    world.wallet = () => json(200, { connected: false })
    await mountPage(ProfitPage)
    expect(push).toHaveBeenCalledWith('/kaspi-shop')
  })
})
