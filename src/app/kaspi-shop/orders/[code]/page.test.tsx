// @vitest-environment happy-dom
// Карточка заказа: 502 {error, sessionExpired} от сервера показывается текстом и плашкой
// переподключения (K3), после ошибки нет вечного «Загружаем заказ...», города подписаны.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { json, mountPage, unmountPage, pageText, byText, click } from '@/lib/kaspiShop/pageTestKit'

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
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
vi.mock('@/components/PageHeader', () => ({
  default: ({ title, subtitle }: any) => createElement('div', null, createElement('h1', null, title), subtitle),
}))
vi.mock('@/lib/usePageDocumentTitle', () => ({ usePageDocumentTitle: () => {} }))

import OrderPage from './page'

const order = (o: any = {}) => ({
  code: '906725811', status: 'PICKUP', creationTime: '2026-11-05T10:00:00.000Z', totalPrice: 12500,
  customerFirstName: 'Аня', customerLastName: 'Серикова', cityName: 'Алматы', destinationCityName: 'Астана',
  plannedDeliveryDate: null, items: [{ code: 'i1', name: 'Чехол для телефона', imageUrl: null, quantity: 2 }], ...o,
})

let orderResponse: () => Response
let orderCalls: number

beforeEach(() => {
  router.push.mockReset()
  orderCalls = 0
  orderResponse = () => json(200, order())
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input)
    if (url === '/api/kaspi-shop/wallet') return json(200, { connected: true, sessionStatus: 'active' })
    if (url === '/api/kaspi-shop/orders/906725811') { orderCalls++; return orderResponse() }
    return json(404, { error: `unexpected ${url}` })
  }) as any
})
afterEach(async () => { vi.restoreAllMocks(); await unmountPage() })

describe('карточка заказа: сбой загрузки', () => {
  it('502 {error, sessionExpired: true}: текст сервера и плашка «Переподключиться», без «Загружаем заказ...»', async () => {
    orderResponse = () => json(502, { error: 'Сессия кабинета Kaspi истекла — переподключите магазин', sessionExpired: true })
    await mountPage(OrderPage)
    const text = pageText()
    expect(text).toContain('Сессия кабинета Kaspi истекла — переподключите магазин')
    expect(text).toContain('Переподключиться')
    expect(byText('a', 'Переподключиться')?.getAttribute('href')).toBe('/kaspi-shop')
    expect(text).not.toContain('Загружаем заказ')
  })

  it('502 без sessionExpired: текст сервера, кнопка «Повторить» перезагружает заказ', async () => {
    orderResponse = () => json(502, { error: 'Kaspi не отдал заказ (Kaspi ответил HTTP 500). Повторите через минуту.' })
    await mountPage(OrderPage)
    expect(pageText()).toContain('Kaspi не отдал заказ')
    expect(pageText()).not.toContain('Переподключиться')
    expect(pageText()).not.toContain('Загружаем заказ')
    expect(orderCalls).toBe(1)
    orderResponse = () => json(200, order())
    await click(byText('button', 'Повторить'))
    expect(orderCalls).toBe(2)
    expect(pageText()).not.toContain('Kaspi не отдал заказ')
    expect(pageText()).toContain('Чехол для телефона')
  })

  it('ответ не JSON (шлюз): не «проверьте соединение», а понятная ошибка, страница не падает', async () => {
    orderResponse = () => new Response('<html>Bad gateway</html>', { status: 502 })
    await mountPage(OrderPage)
    expect(pageText()).toContain('Не удалось загрузить заказ')
    expect(pageText()).not.toContain('Проверьте соединение')
  })

  it('«Заказ не найден» (404) показывается как есть', async () => {
    orderResponse = () => json(404, { error: 'Заказ не найден' })
    await mountPage(OrderPage)
    expect(pageText()).toContain('Заказ не найден')
  })
})

describe('карточка заказа: города', () => {
  it('город точки и город покупателя подписаны по-разному', async () => {
    await mountPage(OrderPage)
    const text = pageText()
    expect(text).toContain('Точка: Алматы')
    expect(text).toContain('Доставка: Астана')
  })

  it('одинаковые или единственный город показываются один раз без подписи-разделения', async () => {
    orderResponse = () => json(200, order({ cityName: 'Алматы', destinationCityName: 'Алматы' }))
    await mountPage(OrderPage)
    expect(pageText()).not.toContain('Точка:')
    expect(pageText()).not.toContain('Доставка:')
    expect(pageText()).toContain('Алматы')
  })

  it('старый ответ без destinationCityName не ломает карточку', async () => {
    orderResponse = () => json(200, order({ destinationCityName: undefined }))
    await mountPage(OrderPage)
    expect(pageText()).toContain('Алматы')
    expect(pageText()).not.toContain('Точка:')
  })
})
