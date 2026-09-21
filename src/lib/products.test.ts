import { describe, it, expect } from 'vitest'
import { parseMyProducts, toggleProduct, isInMyProducts, isSectionVisible, SELECTABLE_KEYS } from './products'

describe('parseMyProducts', () => {
  it('null means never chose', () => {
    expect(parseMyProducts(null)).toBeNull()
  })
  it('reads a stored list', () => {
    expect(parseMyProducts('["invoices","kaspiApi"]')).toEqual(['invoices', 'kaspiApi'])
  })
  it('drops unknown keys instead of failing (e.g. a renamed product)', () => {
    expect(parseMyProducts('["invoices","ghost"]')).toEqual(['invoices'])
  })
  it('degrades to "never chose" on garbage or an empty list, never to an empty menu', () => {
    expect(parseMyProducts('not json')).toBeNull()
    expect(parseMyProducts('{"a":1}')).toBeNull()
    expect(parseMyProducts('[]')).toBeNull()
    expect(parseMyProducts('["ghost"]')).toBeNull()
  })
})

describe('toggleProduct', () => {
  it('first toggle starts from everything selectable, so removing one keeps the rest', () => {
    const next = toggleProduct(null, 'kaspiShop')
    expect(next).not.toContain('kaspiShop')
    expect(next).toContain('invoices')
    expect(next).toContain('aiAgent')
  })
  it('adds a product that is missing', () => {
    expect(toggleProduct(['invoices'], 'kaspiApi')).toEqual(['invoices', 'kaspiApi'])
  })
  it('refuses to remove the last product', () => {
    expect(toggleProduct(['invoices'], 'invoices')).toEqual(['invoices'])
  })
})

describe('locked and admin-only products are never selectable by default', () => {
  it('excludes wildberries (locked) and salon (admin-only)', () => {
    expect(SELECTABLE_KEYS).not.toContain('wildberries')
    expect(SELECTABLE_KEYS).not.toContain('salon')
  })
  it('isInMyProducts with no choice reflects the same set', () => {
    expect(isInMyProducts(null, 'invoices')).toBe(true)
    expect(isInMyProducts(null, 'wildberries')).toBe(false)
  })
})

describe('isSectionVisible', () => {
  it('shows every section when nothing was chosen', () => {
    expect(isSectionVisible(null, 'wildberries', null)).toBe(true)
  })
  it('hides an unchosen section', () => {
    expect(isSectionVisible(['invoices'], 'kaspiShop', null)).toBe(false)
  })
  it('keeps the section you are standing in even if you unchose it', () => {
    expect(isSectionVisible(['invoices'], 'kaspiShop', 'kaspiShop')).toBe(true)
  })
})
