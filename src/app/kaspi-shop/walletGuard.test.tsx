// @vitest-environment happy-dom
// Сбой запроса /api/kaspi-shop/wallet не равен «магазин не подключён» (аудит Kaspi K12, вторая волна):
// страницы кабинета показывают «Повторить» и не уводят подключённого продавца на окно подключения.
// Проверяем все страницы группы одним набором: Обзор, Заказы, Заказ, Нераспознанные, Ниши, НКТ, витрина.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { json, mountPage, unmountPage, pageText, byText, click } from '@/lib/kaspiShop/pageTestKit'

const push = vi.hoisted(() => vi.fn())
// Роутер Next стабилен между рендерами (страницы кладут его в зависимости эффектов): мок тоже.
const router = vi.hoisted(() => ({ push: null as any, back: () => {} }))
router.push = push
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ code: '906725811' }),
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
vi.mock('@/components/BrandLoader', () => ({ default: () => createElement('div', null, 'loading') }))
vi.mock('@/components/PageHeader', () => ({
  default: ({ title, right }: any) => createElement('div', null, createElement('h1', null, title), right),
  PageHeaderButton: ({ children, onClick }: any) => createElement('button', { onClick }, children),
}))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))
vi.mock('@/lib/useCrossHref', () => ({ useCrossHref: () => () => '#' }))
vi.mock('@/components/kaspiShop/NicheCollections', () => ({ default: () => null }))
vi.mock('@/components/kaspiShop/Source1688Button', () => ({ default: () => null }))

const PAGES: { name: string; load: () => Promise<{ default: ComponentType }>; expiredRedirects: boolean }[] = [
  { name: 'Обзор', load: () => import('./overview/page'), expiredRedirects: false },
  { name: 'Заказы', load: () => import('./orders/page'), expiredRedirects: true },
  { name: 'Заказ', load: () => import('./orders/[code]/page'), expiredRedirects: true },
  { name: 'Нераспознанные товары', load: () => import('./pending-products/page'), expiredRedirects: true },
  { name: 'Ниши', load: () => import('./niches/page'), expiredRedirects: true },
  { name: 'Каталог НКТ', load: () => import('./nkt/page'), expiredRedirects: true },
  { name: 'Витрина', load: () => import('./storefront/page'), expiredRedirects: true },
  { name: 'Модели витрины', load: () => import('./storefront/models/page'), expiredRedirects: true },
  { name: 'Заказы витрины', load: () => import('./storefront-orders/page'), expiredRedirects: true },
]

let wallet: () => Response | Promise<Response>
let walletCalls: number

beforeEach(() => {
  push.mockReset()
  walletCalls = 0
  wallet = () => json(200, { connected: true, sessionStatus: 'active', balance: 100 })
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input)
    if (url === '/api/kaspi-shop/wallet') { walletCalls++; return wallet() }
    // Остальные запросы страниц в этом наборе не важны: отвечаем сбоем, страницы его переживают.
    return json(500, { error: 'прочие запросы в этом тесте недоступны' })
  }) as any
})
afterEach(async () => { vi.restoreAllMocks(); await unmountPage() })

describe.each(PAGES)('страница «$name»: запрос /wallet', ({ load, expiredRedirects }) => {
  it('ответ 500: «Повторить» и текст сервера, на /kaspi-shop не уводит', async () => {
    wallet = () => json(500, { error: 'Не удалось проверить подключение (тест)' })
    const { default: Page } = await load()
    await mountPage(Page)
    expect(push).not.toHaveBeenCalledWith('/kaspi-shop')
    expect(pageText()).toContain('Не удалось проверить подключение (тест)')
    expect(byText('button', 'Повторить')).not.toBeNull()
  })

  it('обрыв сети: «Повторить», на /kaspi-shop не уводит', async () => {
    wallet = () => { throw new TypeError('fetch failed') }
    const { default: Page } = await load()
    await mountPage(Page)
    expect(push).not.toHaveBeenCalledWith('/kaspi-shop')
    expect(pageText()).toContain('Не удалось загрузить данные')
    expect(byText('button', 'Повторить')).not.toBeNull()
  })

  it('«Повторить» снова спрашивает /wallet, и при успехе плашка ошибки пропадает', async () => {
    wallet = () => json(500, { error: 'Не удалось проверить подключение (тест)' })
    const { default: Page } = await load()
    await mountPage(Page)
    expect(walletCalls).toBe(1)
    wallet = () => json(200, { connected: true, sessionStatus: 'active', balance: 100 })
    await click(byText('button', 'Повторить'))
    expect(walletCalls).toBeGreaterThanOrEqual(2)
    expect(pageText()).not.toContain('Не удалось проверить подключение (тест)')
    expect(push).not.toHaveBeenCalledWith('/kaspi-shop')
  })

  it('магазин честно не подключён (200, connected: false): уводит на /kaspi-shop', async () => {
    wallet = () => json(200, { connected: false })
    const { default: Page } = await load()
    await mountPage(Page)
    expect(push).toHaveBeenCalledWith('/kaspi-shop')
  })

  it(expiredRedirects ? 'сессия Kaspi истекла: уводит на /kaspi-shop' : 'сессия Kaspi истекла: остаётся на странице с плашкой «Переподключить»', async () => {
    wallet = () => json(200, { connected: true, sessionStatus: 'session_expired' })
    const { default: Page } = await load()
    await mountPage(Page)
    if (expiredRedirects) {
      expect(push).toHaveBeenCalledWith('/kaspi-shop')
    } else {
      expect(push).not.toHaveBeenCalledWith('/kaspi-shop')
      expect(pageText()).toContain('Сессия Kaspi истекла')
    }
  })
})
