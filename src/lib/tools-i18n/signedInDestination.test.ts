import { describe, it, expect } from 'vitest'
import { anonymousToolHref, signedInToolHref } from './signedInDestination'

describe('signedInToolHref (free tools -> cabinet for a signed-in visitor)', () => {
  it('document tools and the counterparty check open the invoice form', () => {
    for (const tool of ['kp', 'schet', 'avr', 'nakladnaya', 'kontragent']) {
      expect(signedInToolHref(tool, 'cta')).toBe(`/create?utm_source=tools&utm_medium=cta&utm_campaign=${tool}`)
    }
    expect(signedInToolHref('kontragent', 'fullcard')).toBe('/create?utm_source=tools&utm_medium=fullcard&utm_campaign=kontragent')
    expect(signedInToolHref('schet', 'limit')).toBe('/create?utm_source=tools&utm_medium=limit&utm_campaign=schet')
  })
  it('taxes go to the dashboard', () => {
    expect(signedInToolHref('nalogi', 'cta')).toBe('/dashboard?utm_source=tools&utm_medium=cta&utm_campaign=nalogi')
  })
  it('margin: Kaspi Bot cabinet only with access, otherwise the Kaspi Bot landing', () => {
    expect(signedInToolHref('margin', 'cta', { kaspiShopAccess: true })).toBe('/kaspi-shop?utm_source=tools&utm_medium=cta&utm_campaign=margin')
    expect(signedInToolHref('margin', 'cta', { kaspiShopAccess: false })).toBe('https://kaspi.invoices.kz/?utm_source=tools&utm_medium=cta&utm_campaign=margin')
    expect(signedInToolHref('margin', 'cta')).toBe('https://kaspi.invoices.kz/?utm_source=tools&utm_medium=cta&utm_campaign=margin')
  })
  it('unknown tool -> dashboard, and never /login', () => {
    expect(signedInToolHref('whatever', 'cta')).toBe('/dashboard?utm_source=tools&utm_medium=cta&utm_campaign=whatever')
    for (const tool of ['kp', 'schet', 'avr', 'nakladnaya', 'kontragent', 'nalogi', 'zarplata', 'margin', 'x']) {
      expect(signedInToolHref(tool, 'cta')).not.toMatch(/^\/login/)
    }
  })
  it('anonymous links are unchanged', () => {
    expect(anonymousToolHref('kp', 'limit')).toBe('/login?utm_source=tools&utm_medium=limit&utm_campaign=kp')
    expect(anonymousToolHref('kontragent', 'fullcard')).toBe('/login?utm_source=tools&utm_medium=fullcard&utm_campaign=kontragent')
    expect(anonymousToolHref('margin', 'cta')).toBe('/login?utm_source=tools&utm_medium=cta&utm_campaign=margin')
  })
})
