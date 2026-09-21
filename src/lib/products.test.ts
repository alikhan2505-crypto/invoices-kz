import { describe, it, expect } from 'vitest'
import { personaProducts, homeFor, parseMyProducts, toggleProduct, isInMyProducts, isSectionVisible, SELECTABLE_KEYS } from './products'

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

describe('locked products are never selectable by default', () => {
  it('excludes wildberries (locked); salon is public by application since 21.09', () => {
    expect(SELECTABLE_KEYS).not.toContain('wildberries')
    expect(SELECTABLE_KEYS).toContain('salon')
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

describe('homeFor', () => {
  it('sends people to the right place after login', () => {
    expect(homeFor(null)).toBe('/dashboard')
    expect(homeFor([])).toBe('/dashboard')
    expect(homeFor(['invoices'])).toBe('/dashboard')
    expect(homeFor(['kaspiShop'])).toBe('/kaspi-shop')
    expect(homeFor(['aiAgent'])).toBe('/ai-agent')
    expect(homeFor(['invoices', 'kaspiShop'])).toBe('/products')
    expect(homeFor(['wildberries'])).toBe('/dashboard')
    expect(homeFor(['nonsense'])).toBe('/dashboard')
  })
})

describe('personaProducts', () => {
  it('maps a start-page answer to products; unknown answers to nothing', () => {
    expect(personaProducts('kaspi')).toEqual(['kaspiShop'])
    expect(personaProducts('salon')).toEqual(['salon', 'aiAgent'])
    expect(personaProducts('hacker')).toBeNull()
    expect(personaProducts(null)).toBeNull()
  })
})
