import { describe, it, expect } from 'vitest'
import { LANDINGS, landingSeo, META_TITLE_MAX, META_DESCRIPTION_MAX, PRICING_URL, type LandingKey } from './landings'

const KEYS = Object.keys(LANDINGS) as LandingKey[]

describe('landingSeo', () => {
  it.each(KEYS)('%s: title and description fit the snippet limits', (key) => {
    const { title, description } = landingSeo(key)
    expect(title.length).toBeLessThanOrEqual(META_TITLE_MAX)
    expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX)
    expect(title.length).toBeGreaterThan(0)
  })

  it.each(KEYS)('%s: Russian only (no Kazakh-specific letters)', (key) => {
    const { title, description } = landingSeo(key)
    expect(`${title} ${description}`).not.toMatch(/[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/)
  })

  it.each(KEYS)('%s: brand appears at most once and only at the end', (key) => {
    const { title } = landingSeo(key)
    const count = title.split('invoices.kz').length - 1
    expect(count).toBeLessThanOrEqual(1)
    if (count === 1) expect(title.endsWith('| invoices.kz')).toBe(true)
  })

  it('appends the brand only when the title still fits', () => {
    // Salon sits right at the limit with the brand; agent does not fit and drops it.
    expect(landingSeo('salon').title.endsWith('| invoices.kz')).toBe(true)
    expect(landingSeo('agent').title.endsWith('| invoices.kz')).toBe(false)
  })
})

describe('PRICING_URL', () => {
  it('points at the public pricing anchor, not the noindex /upgrade page', () => {
    expect(PRICING_URL).toBe('https://docs.invoices.kz/#pricing')
    expect(PRICING_URL).not.toContain('/upgrade')
  })
})
