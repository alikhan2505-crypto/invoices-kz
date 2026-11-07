// @vitest-environment happy-dom
// Отзывы: заголовочные числа по карточкам с честными подписями (K40); «Обновить» следит
// за прогрессом ИМЕННО своего запуска и не запускает второй, если первый идёт (K42).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { json, mountPage, unmountPage, pageText, byText, click, waitFor } from '@/lib/kaspiShop/pageTestKit'

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
vi.mock('@/components/PageHeader', () => ({
  default: ({ title, right }: any) => createElement('div', null, createElement('h1', null, title), right),
  PageHeaderButton: ({ children, onClick, disabled }: any) => createElement('button', { onClick, disabled }, children),
}))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))

import ReviewsPage from './page'

const rev = (rating: number, n: number) => ({ rating, text: `Отзыв ${n}`, authorName: 'Аня', date: '2026-10-01T00:00:00.000Z', trackedProductId: 'p1', productName: 'Чехол' })
const base = (o: any = {}) => ({
  stats: { avgRating: 4.5, total: 4, negative: 1, fiveStar: 2 },
  catalog: { totalCount: 245, avgRating: 4.8, productsWithTotals: 1, productsCount: 1 },
  reviews: [rev(5, 1), rev(5, 2), rev(4, 3), rev(2, 4)],
  lastFetchedAt: '2026-11-06T09:00:00.000Z', productErrorCount: 0, refresh: null, ...o,
})

let world: {
  get: (qs: string) => any
  post: { status: number; body: any }
  calls: Array<{ url: string; method: string }>
  wallet: () => Response
}
function installFetch() {
  globalThis.fetch = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    const method = (init?.method || 'GET').toUpperCase()
    world.calls.push({ url, method })
    if (url === '/api/kaspi-shop/wallet') return world.wallet()
    if (url.startsWith('/api/kaspi-shop/reviews') && method === 'POST') return json(world.post.status, world.post.body)
    if (url.startsWith('/api/kaspi-shop/reviews')) return json(200, world.get(url.split('?')[1] || ''))
    return json(404, { error: `unexpected ${url}` })
  }) as any
}

beforeEach(() => {
  world = { get: () => base(), post: { status: 202, body: { ok: true, dispatchedCount: 2, since: '2026-11-06T10:00:00.000Z' } }, calls: [], wallet: () => json(200, { connected: true, sessionStatus: 'active' }) }
  installFetch()
  push.mockReset()
})
afterEach(async () => { vi.restoreAllMocks(); await unmountPage() })

// Опрос страницы спит по 3 секунды; в тесте сжимаем такие паузы, остальные таймеры не трогаем.
function speedUpPolling() {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any, ms?: number, ...args: any[]) =>
    realSetTimeout(fn, (ms ?? 0) >= 1000 ? 5 : ms, ...args)) as any)
}

describe('страница Отзывы: числа и подписи (K40)', () => {
  it('«всего отзывов» это total_count карточек (245), загруженная выборка названа отдельно', async () => {
    await mountPage(ReviewsPage)
    const text = pageText()
    expect(text).toContain('245')
    expect(text).toContain('4.8')
    expect(text).toContain('средняя оценка по карточкам товаров')
    expect(text).toContain('отзывов на карточках · загружено 4')
    expect(text).toContain('негативных (≤3★) среди загруженных')
    expect(text).toContain('до 50 самых популярных отзывов на товар')
    expect(text).toContain('а не рейтинг вашего магазина')
  })

  it('пока Kaspi не вернул числа карточек, вместо нулей тире', async () => {
    world.get = () => base({ catalog: { totalCount: null, avgRating: null, productsWithTotals: 0, productsCount: 1 } })
    await mountPage(ReviewsPage)
    expect(pageText()).toContain('—средняя оценка по карточкам товаров')
  })
})

describe('страница Отзывы: обновление (K42)', () => {
  it('прогресс считается по товарам текущего запуска (since с сервера), а не по самой свежей строке', async () => {
    speedUpPolling()
    const progress: Array<{ expected: number; updated: number }> = [{ expected: 2, updated: 0 }, { expected: 2, updated: 1 }, { expected: 2, updated: 1 }, { expected: 2, updated: 2 }]
    let i = 0
    const seen: string[] = []
    world.get = qs => {
      if (!qs.includes('since=')) return base()
      const p = progress[Math.min(i++, progress.length - 1)]
      seen.push(`${p.updated}/${p.expected}`)
      return base({ refresh: p })
    }
    await mountPage(ReviewsPage)
    await click(byText('button', 'Обновить'))
    await waitFor(() => i >= 4)
    await waitFor(() => !pageText().includes('Обновляем...'))
    expect(world.calls.filter(c => c.method === 'POST')).toHaveLength(1)
    // опрос ходил с серверным since, а не с часами браузера, и не остановился на 1 из 2
    const polls = world.calls.filter(c => c.method === 'GET' && c.url.includes('since='))
    expect(polls[0].url).toContain('since=2026-11-06T10%3A00%3A00.000Z')
    expect(polls.length).toBeGreaterThanOrEqual(4)
    expect(seen).toEqual(['0/2', '1/2', '1/2', '2/2'])
    expect(pageText()).not.toContain('Обновлено 1 из 2')
    expect(pageText()).not.toContain('Проверяем')
  })

  it('«уже идёт»: второй запуск не создаётся, страница просто следит за идущим', async () => {
    // Без ускорения опроса: сразу после нажатия на экране подпись «уже идёт», первый опрос через 3 с.
    world.post = { status: 429, body: { error: 'Обновление отзывов уже идёт', alreadyRunning: true, since: '2026-11-06T10:00:00.000Z', retryAfterSeconds: 600, dispatchedCount: 2 } }
    world.get = qs => (qs.includes('since=') ? base({ refresh: { expected: 2, updated: 1 } }) : base())
    await mountPage(ReviewsPage)
    await click(byText('button', 'Обновить'))
    expect(pageText()).toContain('Обновление отзывов уже идёт')
    expect(world.calls.filter(c => c.method === 'POST')).toHaveLength(1)
    await waitFor(() => pageText().includes('Обновлено 1 из 2 товаров'), 6000)
    expect(world.calls.filter(c => c.method === 'POST')).toHaveLength(1)
    // это не ошибка загрузки
    expect(byText('button', 'Повторить')).toBeNull()
  })

  it('слишком рано для нового запуска, а прошлый закончился: сообщение без опроса и без ошибки', async () => {
    world.post = { status: 429, body: { error: 'Отзывы уже обновлены. Новый запуск можно не раньше чем через 12 мин.', alreadyRunning: false, since: '2026-11-06T10:00:00.000Z', retryAfterSeconds: 700 } }
    await mountPage(ReviewsPage)
    await click(byText('button', 'Обновить'))
    expect(pageText()).toContain('Отзывы уже обновлены')
    expect(byText('button', 'Повторить')).toBeNull()
    expect(world.calls.filter(c => c.url.includes('since='))).toHaveLength(0)
  })

  it('другая ошибка запуска показывается как ошибка', async () => {
    world.post = { status: 502, body: { error: 'Не удалось запустить обновление отзывов' } }
    await mountPage(ReviewsPage)
    await click(byText('button', 'Обновить'))
    expect(pageText()).toContain('Не удалось запустить обновление отзывов')
    expect(byText('button', 'Повторить')).not.toBeNull()
  })

  it('K12: сбой запроса подключения (500) показывает «Повторить», а не уводит на /kaspi-shop', async () => {
    world.wallet = () => json(500, { error: 'Сервис временно недоступен' })
    await mountPage(ReviewsPage)
    expect(push).not.toHaveBeenCalled()
    expect(byText('button', 'Повторить')).not.toBeNull()
    world.wallet = () => json(200, { connected: true, sessionStatus: 'active' })
    await click(byText('button', 'Повторить'))
    expect(push).not.toHaveBeenCalled()
    expect(pageText()).toContain('Отзыв 1')
  })

  it('K12: честно не подключённый магазин по-прежнему уводит на /kaspi-shop', async () => {
    world.wallet = () => json(200, { connected: false })
    await mountPage(ReviewsPage)
    expect(push).toHaveBeenCalledWith('/kaspi-shop')
  })
})
