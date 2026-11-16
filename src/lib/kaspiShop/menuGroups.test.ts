import { describe, it, expect } from 'vitest'
import { splitMenuLinks } from './menuGroups'
import { EMPTY_MENU_COUNTS } from './menuCounts'

const LINKS = [
  { href: '/kaspi-shop/overview' },
  { href: '/kaspi-shop' },
  { href: '/kaspi-shop/orders' },
  { href: '/kaspi-shop/refunds', more: true },
  { href: '/kaspi-shop/finance', more: true },
  { href: '/kaspi-shop/pending-products', more: true },
  { href: '/kaspi-shop/margin' },
  { href: '/kaspi-shop/storefront', soon: true },
]
const hrefs = (a: { href: string }[]) => a.map(l => l.href)

describe('splitMenuLinks', () => {
  it('на старте видны 4 пункта, остальное в «Ещё», «скоро» скрыто', () => {
    const r = splitMenuLinks(LINKS, { counts: EMPTY_MENU_COUNTS, isAdmin: false })
    expect(hrefs(r.primary)).toEqual(['/kaspi-shop/overview', '/kaspi-shop', '/kaspi-shop/orders', '/kaspi-shop/margin'])
    expect(hrefs(r.more)).toEqual(['/kaspi-shop/refunds', '/kaspi-shop/finance', '/kaspi-shop/pending-products'])
    expect(r.moreOpenByDefault).toBe(false)
  })

  it('пункт с числом выходит наверх на своё место; ноль и неизвестное остаются в «Ещё»', () => {
    const r = splitMenuLinks(LINKS, { counts: { orders: 3, refunds: 2, pendingProducts: 0 }, isAdmin: false })
    expect(hrefs(r.primary)).toEqual(['/kaspi-shop/overview', '/kaspi-shop', '/kaspi-shop/orders', '/kaspi-shop/refunds', '/kaspi-shop/margin'])
    expect(hrefs(r.more)).toContain('/kaspi-shop/pending-products')
    const r2 = splitMenuLinks(LINKS, { counts: { orders: null, refunds: null, pendingProducts: null }, isAdmin: false })
    expect(hrefs(r2.primary)).not.toContain('/kaspi-shop/refunds')
  })

  it('число есть только у пунктов со счётчиком: Финансы с more остаётся в «Ещё»', () => {
    const r = splitMenuLinks(LINKS, { counts: { orders: 9, refunds: 9, pendingProducts: 9 }, isAdmin: false })
    expect(hrefs(r.more)).toEqual(['/kaspi-shop/finance'])
  })

  it('админ видит «скоро» как обычные ссылки в «Ещё»', () => {
    const r = splitMenuLinks(LINKS, { counts: EMPTY_MENU_COUNTS, isAdmin: true })
    expect(hrefs(r.more)).toContain('/kaspi-shop/storefront')
  })

  it('открыта страница из «Ещё»: группа раскрыта сама', () => {
    expect(splitMenuLinks(LINKS, { counts: EMPTY_MENU_COUNTS, isAdmin: false, activeHref: '/kaspi-shop/finance' }).moreOpenByDefault).toBe(true)
    expect(splitMenuLinks(LINKS, { counts: EMPTY_MENU_COUNTS, isAdmin: false, activeHref: '/kaspi-shop/orders' }).moreOpenByDefault).toBe(false)
  })

  it('открыта страница, вышедшая наверх по числу: «Ещё» не раскрывается без нужды', () => {
    const r = splitMenuLinks(LINKS, { counts: { orders: 0, refunds: 4, pendingProducts: 0 }, isAdmin: false, activeHref: '/kaspi-shop/refunds' })
    expect(r.moreOpenByDefault).toBe(false)
  })
})
