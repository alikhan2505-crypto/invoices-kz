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

// Правило основателя 07.11.2026: Kaspi Bot не берёт деньги за проверки цен, 5 ₸ только за
// каждое изменение цены ботом. Лендинг не должен обещать «5 ₸ за каждую проверку».
describe('LANDINGS.kaspi.priceNote: модель списаний', () => {
  const note = LANDINGS.kaspi.priceNote!

  it('ru: проверки бесплатны, 5 ₸ только за изменение цены ботом, тариф Про указан', () => {
    expect(note.ru).toContain('Проверки цен бесплатны')
    expect(note.ru).toContain('только за каждое изменение цены ботом')
    expect(note.ru).toMatch(/^Входит в тариф Про, /)
    expect(note.ru).not.toContain('Каждая проверка')
  })

  it('kk: бағаны тексеру тегін, 5 ₸ тек бот бағаны өзгерткенде; термин «Про тарифі» из памятки', () => {
    expect(note.kk).toContain('Бағаны тексеру тегін')
    expect(note.kk).toContain('бот бағаны өзгерткен сайын')
    expect(note.kk).toContain('Про тарифіне')
    expect(note.kk).not.toContain('әр тексеру')
  })

  it('en: price checks are free, 5 ₸ only for each price change the bot makes', () => {
    expect(note.en).toContain('Price checks are free')
    expect(note.en).toContain('only for each price change the bot makes')
    expect(note.en).not.toContain('Each price check')
  })

  it('no language promises a charge per check, and no long dash survives in the Kaspi note', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      expect(note[lang]).not.toContain('—')
      expect(note[lang]).toMatch(/5 ₸/)
    }
  })
})
