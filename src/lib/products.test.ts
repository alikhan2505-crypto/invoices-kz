import { describe, it, expect } from 'vitest'
import { personaProducts, personasProducts, selectablePersonaProducts, parsePersonaKeys, PERSONAS, PRODUCTS, homeFor, parseMyProducts, toggleProduct, isInMyProducts, isSectionVisible, SELECTABLE_KEYS } from './products'

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
  it('excludes wildberries (locked), cfo and salon (closed teasers, salon closed 23.10.2026)', () => {
    expect(SELECTABLE_KEYS).not.toContain('wildberries')
    expect(SELECTABLE_KEYS).not.toContain('cfo')
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
  it('while the list is still loading shows only the base product and the active section', () => {
    expect(isSectionVisible(null, 'invoices', null, false)).toBe(true)
    expect(isSectionVisible(null, 'kaspiShop', null, false)).toBe(false)
    expect(isSectionVisible(null, 'wildberries', null, false)).toBe(false)
    expect(isSectionVisible(null, 'kaspiShop', 'kaspiShop', false)).toBe(true)
  })
  it('a known list ignores the ready flag', () => {
    expect(isSectionVisible(['invoices', 'kaspiShop'], 'kaspiShop', null, false)).toBe(true)
    expect(isSectionVisible(['invoices'], 'kaspiShop', null, false)).toBe(false)
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
    expect(homeFor(['kaspiShop'])).toBe('/kaspi-shop/overview')
    expect(homeFor(['aiAgent'])).toBe('/ai-agent/overview')
    expect(homeFor(['cfo'])).toBe('/cfo/overview')
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

describe('every product is reachable by some answer', () => {
  it('no product is left without a persona (the gap the founder spotted 13.10)', () => {
    const reachable = new Set(PERSONAS.flatMap((p) => p.products))
    for (const p of PRODUCTS) expect(reachable.has(p.key)).toBe(true)
  })
})

describe('personasProducts (several answers)', () => {
  it('adds products up, without duplicates, in the hub order', () => {
    expect(personasProducts(['ip', 'kaspi'])).toEqual(['invoices', 'kaspiShop'])
    expect(personasProducts(['messengers', 'salon'])).toEqual(['invoices', 'aiAgent', 'salon'])
  })
  it('nothing picked (or only unknown answers) means show everything', () => {
    expect(personasProducts([])).toBeNull()
    expect(personasProducts(['hacker'])).toBeNull()
  })
})

describe('selectablePersonaProducts (what goes into an account menu)', () => {
  it('never puts the locked WB or the admin-only CFO into a regular menu', () => {
    expect(selectablePersonaProducts(['finance'])).toEqual(['invoices'])
    expect(selectablePersonaProducts(['wb'])).toBeNull()
    expect(selectablePersonaProducts(['wb', 'kaspi'])).toEqual(['kaspiShop'])
  })
  it('an admin does get CFO', () => {
    expect(selectablePersonaProducts(['finance'], true)).toEqual(['invoices', 'cfo'])
  })
})

describe('parsePersonaKeys (pending answers across /login)', () => {
  it('reads the comma list and the old single value alike, dropping unknowns', () => {
    expect(parsePersonaKeys('kaspi,ip')).toEqual(['kaspi', 'ip'])
    expect(parsePersonaKeys('kaspi')).toEqual(['kaspi'])
    expect(parsePersonaKeys('kaspi,hacker, dev')).toEqual(['kaspi', 'dev'])
    expect(parsePersonaKeys(null)).toEqual([])
    expect(parsePersonaKeys('')).toEqual([])
  })
})
