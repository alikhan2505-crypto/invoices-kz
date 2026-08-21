import { describe, it, expect } from 'vitest'
import {
  computeMargin,
  computeVerdict,
  estimateKaspiDeliveryFee,
  KASPI_CATEGORY_COMMISSIONS,
  DEFAULT_CARGO_RATE_PER_KG,
  DEFAULT_TARGET_MARGIN_PERCENT,
} from './margin'

describe('computeMargin', () => {
  it('computes the full breakdown for a typical small item', () => {
    // Kaspi price 10000, commission 12.5%, sourcing 3000, weight 300g,
    // cargo 1500/kg => 450, packaging 200, delivery 800.
    const result = computeMargin({
      kaspiPrice: 10000,
      commissionRatePercent: 12.5,
      sourcingPrice: 3000,
      weightGrams: 300,
      cargoRatePerKgTenge: 1500,
      packagingCost: 200,
      deliveryFee: 800,
    })
    expect(result.commissionAmount).toBeCloseTo(1250, 5)
    expect(result.cargoCost).toBeCloseTo(450, 5)
    expect(result.cogs).toBeCloseTo(3650, 5) // 3000 + 450 + 200
    expect(result.profit).toBeCloseTo(4300, 5) // 10000 - 1250 - 800 - 3650
    expect(result.marginPercent).toBeCloseTo(43, 5) // 4300 / 10000 * 100
  })

  it('converts weight from grams to kilograms for the cargo cost', () => {
    const result = computeMargin({
      kaspiPrice: 5000,
      commissionRatePercent: 0,
      sourcingPrice: 0,
      weightGrams: 1000,
      cargoRatePerKgTenge: 2000,
      packagingCost: 0,
      deliveryFee: 0,
    })
    expect(result.cargoCost).toBe(2000)
  })

  it('returns a negative profit and negative margin when costs exceed the sale price', () => {
    const result = computeMargin({
      kaspiPrice: 1000,
      commissionRatePercent: 12.5,
      sourcingPrice: 900,
      weightGrams: 500,
      cargoRatePerKgTenge: 1500,
      packagingCost: 100,
      deliveryFee: 500,
    })
    expect(result.profit).toBeLessThan(0)
    expect(result.marginPercent).toBeLessThan(0)
  })

  it('treats a zero sale price as 0% margin instead of dividing by zero', () => {
    const result = computeMargin({
      kaspiPrice: 0,
      commissionRatePercent: 10,
      sourcingPrice: 100,
      weightGrams: 100,
      cargoRatePerKgTenge: 1500,
      packagingCost: 0,
      deliveryFee: 0,
    })
    expect(result.marginPercent).toBe(0)
    expect(Number.isFinite(result.marginPercent)).toBe(true)
  })

  it('margin is computed against the sale price, not against cost (not markup)', () => {
    // Profit 5000 on a 10000 sale price is 50% margin, NOT 100% markup on a 5000 cost.
    const result = computeMargin({
      kaspiPrice: 10000,
      commissionRatePercent: 0,
      sourcingPrice: 5000,
      weightGrams: 0,
      cargoRatePerKgTenge: 0,
      packagingCost: 0,
      deliveryFee: 0,
    })
    expect(result.profit).toBe(5000)
    expect(result.marginPercent).toBe(50)
  })

  it('a lower simulated sale price (sensitivity / "what if price drops") reduces both commission and margin', () => {
    const inputs = {
      commissionRatePercent: 12.5,
      sourcingPrice: 3000,
      weightGrams: 300,
      cargoRatePerKgTenge: 1500,
      packagingCost: 200,
      deliveryFee: 800,
    }
    const atFullPrice = computeMargin({ ...inputs, kaspiPrice: 10000 })
    const atDiscountedPrice = computeMargin({ ...inputs, kaspiPrice: 8000 })
    expect(atDiscountedPrice.commissionAmount).toBeLessThan(atFullPrice.commissionAmount)
    expect(atDiscountedPrice.marginPercent).toBeLessThan(atFullPrice.marginPercent)
  })
})

describe('computeVerdict', () => {
  it('is "take" when margin meets the target exactly (boundary is inclusive)', () => {
    expect(computeVerdict(20, 20)).toBe('take')
  })

  it('is "take" when margin exceeds the target', () => {
    expect(computeVerdict(35, 20)).toBe('take')
  })

  it('is "skip" when margin falls short of the target', () => {
    expect(computeVerdict(19.9, 20)).toBe('skip')
  })

  it('is "skip" for a negative margin regardless of target', () => {
    expect(computeVerdict(-5, 20)).toBe('skip')
  })
})

describe('estimateKaspiDeliveryFee', () => {
  it('returns the lightest tier for a small item', () => {
    expect(estimateKaspiDeliveryFee(200)).toBe(990)
  })

  it('is monotonically non-decreasing across weight tiers', () => {
    const weights = [100, 500, 800, 1000, 2000, 3000, 4000, 5000, 8000]
    const fees = weights.map(estimateKaspiDeliveryFee)
    for (let i = 1; i < fees.length; i++) {
      expect(fees[i]).toBeGreaterThanOrEqual(fees[i - 1])
    }
  })

  it('returns the heaviest tier for a large parcel', () => {
    expect(estimateKaspiDeliveryFee(10000)).toBe(2990)
  })

  it('is a pure function of weight only (same input, same output)', () => {
    expect(estimateKaspiDeliveryFee(1200)).toBe(estimateKaspiDeliveryFee(1200))
  })
})

describe('KASPI_CATEGORY_COMMISSIONS', () => {
  it('is non-empty and every entry has a label and a rate between 0 and 100', () => {
    expect(KASPI_CATEGORY_COMMISSIONS.length).toBeGreaterThan(0)
    for (const entry of KASPI_CATEGORY_COMMISSIONS) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.ratePercent).toBeGreaterThan(0)
      expect(entry.ratePercent).toBeLessThan(100)
    }
  })

  it('has no duplicate labels', () => {
    const labels = KASPI_CATEGORY_COMMISSIONS.map(c => c.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('includes the real published rate for Продукты питания (food, lower commission tier)', () => {
    const food = KASPI_CATEGORY_COMMISSIONS.find(c => c.label === 'Продукты питания')
    expect(food?.ratePercent).toBe(7.3)
  })
})

describe('defaults', () => {
  it('exposes a sane positive default cargo rate', () => {
    expect(DEFAULT_CARGO_RATE_PER_KG).toBeGreaterThan(0)
  })

  it('exposes a sane positive default target margin', () => {
    expect(DEFAULT_TARGET_MARGIN_PERCENT).toBeGreaterThan(0)
  })
})
