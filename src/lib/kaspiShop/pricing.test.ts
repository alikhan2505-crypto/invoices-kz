import { describe, it, expect } from 'vitest'
import { computeRepriceCandidate, generatePriceListXml } from './pricing'

describe('computeRepriceCandidate', () => {
  it('undercuts the competitor by the seller-set step when above the floor', () => {
    const result = computeRepriceCandidate({ competitorPrice: 10000, undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 9900, heldAtFloor: false })
  })

  it('holds at the floor when undercutting would go below it', () => {
    const result = computeRepriceCandidate({ competitorPrice: 5050, undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 5000, heldAtFloor: true })
  })

  it('holds at exactly the floor when the candidate lands exactly on it', () => {
    const result = computeRepriceCandidate({ competitorPrice: 5100, undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 5000, heldAtFloor: false })
  })

  it('holds at the floor when no competitor price is available (nothing to undercut)', () => {
    const result = computeRepriceCandidate({ competitorPrice: null, undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 5000, heldAtFloor: true })
  })
})

describe('generatePriceListXml', () => {
  it('produces a kaspi_catalog document matching the documented offer schema', () => {
    const xml = generatePriceListXml({
      companyName: 'Test Company',
      merchantId: 'MC123',
      products: [
        { sku: 'SKU1', model: 'iphone 5s white 32gb', brand: 'Apple', storeId: 'point1', stockCount: 5, price: 6418 },
      ],
    })
    expect(xml).toContain('<company>Test Company</company>')
    expect(xml).toContain('<merchantid>MC123</merchantid>')
    expect(xml).toContain('<offer sku="SKU1">')
    expect(xml).toContain('<model>iphone 5s white 32gb</model>')
    expect(xml).toContain('<brand>Apple</brand>')
    expect(xml).toContain('<availability available="yes" storeId="point1" stockCount="5"/>')
    expect(xml).toContain('<price>6418</price>')
  })

  it('escapes special XML characters in text fields', () => {
    const xml = generatePriceListXml({
      companyName: 'A & B',
      merchantId: 'MC123',
      products: [{ sku: 'SKU2', model: 'Cable <3m>', brand: 'X&Y', storeId: 'p1', stockCount: 0, price: 100 }],
    })
    expect(xml).toContain('A &amp; B')
    expect(xml).toContain('Cable &lt;3m&gt;')
    expect(xml).toContain('X&amp;Y')
  })

  it('marks zero stock as unavailable', () => {
    const xml = generatePriceListXml({
      companyName: 'C',
      merchantId: 'M',
      products: [{ sku: 'SKU3', model: 'X', brand: 'Y', storeId: 'p1', stockCount: 0, price: 100 }],
    })
    expect(xml).toContain('available="no"')
  })

  it('rounds price to the nearest whole tenge (Kaspi price-list has no decimals)', () => {
    const xml = generatePriceListXml({
      companyName: 'C',
      merchantId: 'M',
      products: [{ sku: 'SKU4', model: 'X', brand: 'Y', storeId: 'p1', stockCount: 1, price: 100.6 }],
    })
    expect(xml).toContain('<price>101</price>')
  })
})
