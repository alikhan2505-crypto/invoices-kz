import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  computeMargin,
  computeVerdict,
  estimateKaspiDeliveryFee,
  KASPI_CATEGORY_COMMISSIONS,
  DEFAULT_CARGO_RATE_PER_KG,
  DEFAULT_TARGET_MARGIN_PERCENT, computeBreakEvenPrice } from './margin'

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

  // Verified against Kaspi's tariff "с 5 января 2026 года" on 23.10.2026.
  it('keeps the stored labels of the split categories unchanged and adds the verified exceptions as new rows', () => {
    const rate = (label: string) => KASPI_CATEGORY_COMMISSIONS.find(c => c.label === label)?.ratePercent
    // Existing labels are persisted identifiers (kaspi_shop_product_costs), never reworded.
    expect(rate('Телефоны и гаджеты — аксессуары (чехлы, кабели, стёкла)')).toBe(15.5)
    expect(rate('Товары для животных — корма и лакомства')).toBe(7.3)
    // Chargers and power banks sit in the phone-accessories branch of the tariff but at 12,5%.
    expect(rate('Телефоны и гаджеты — зарядные устройства и внешние аккумуляторы')).toBe(12.5)
    // Litter and compound feed for farm animals are in the 7,3% tier too.
    expect(rate('Товары для животных — наполнители туалета и комбикорма')).toBe(7.3)
  })

  it('does not carry the unconfirmed 28.01.2026 date or the dead /conditions/commissions link in its source comment', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/kaspiShop/margin.ts'), 'utf8')
    expect(src).not.toContain('28.01.2026')
    expect(src).not.toContain('conditions/commissions')
    expect(src).toContain('conditions/q1344')
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

describe('computeBreakEvenPrice', () => {
  // Same cost structure used throughout this file's other cases.
  const costs = {
    commissionRatePercent: 12.5,
    sourcingPrice: 3000,
    weightGrams: 500,
    cargoRatePerKgTenge: 1500,
    packagingCost: 200,
    deliveryFee: 799,
  }

  it('puts the floor above the plain sum of costs, because commission scales with price', () => {
    const fixed = 3000 + 750 + 200 + 799
    const { breakEven } = computeBreakEvenPrice(costs)
    expect(breakEven).toBeGreaterThan(fixed)
    expect(breakEven).toBeCloseTo(fixed / 0.875, 6)
  })

  // The property that matters: price the product at the returned floor and the
  // existing margin calculation must agree that it earns nothing.
  it('breaks even when fed back into computeMargin', () => {
    const { breakEven } = computeBreakEvenPrice(costs)
    const at = computeMargin({ ...costs, kaspiPrice: breakEven as number })
    expect(at.profit).toBeCloseTo(0, 6)
    expect(at.marginPercent).toBeCloseTo(0, 6)
  })

  it('returns the price that actually hits the target margin', () => {
    const { atTargetMargin } = computeBreakEvenPrice(costs, 20)
    const at = computeMargin({ ...costs, kaspiPrice: atTargetMargin as number })
    expect(at.marginPercent).toBeCloseTo(20, 6)
  })

  it('has no answer when commission alone takes the whole price', () => {
    expect(computeBreakEvenPrice({ ...costs, commissionRatePercent: 100 }).breakEven).toBeNull()
  })

  it('has no target price when commission and target together take everything', () => {
    const r = computeBreakEvenPrice({ ...costs, commissionRatePercent: 85 }, 20)
    expect(r.breakEven).not.toBeNull()
    expect(r.atTargetMargin).toBeNull()
  })

  it('treats negative inputs as zero instead of producing a negative floor', () => {
    const r = computeBreakEvenPrice({ ...costs, sourcingPrice: -5000, packagingCost: -1 })
    expect(r.breakEven).toBeGreaterThan(0)
  })
})

describe('komissiya-kaspi source notes (ru, kk) and the margin FAQ', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const pages = ['src/app/guides/komissiya-kaspi/page.tsx', 'src/app/guides/kk/komissiya-kaspi/page.tsx']

  it.each(pages)('%s cites the 05.01.2026 tariff checked 23.10.2026, not the unconfirmed 28.01.2026 edition', file => {
    const src = read(file)
    expect(src).not.toContain('28.01.2026')
    expect(src).toContain('05.01.2026')
    expect(src).toContain('23.10.2026')
    expect(src).toContain('conditions/q1344')
    expect(src).toContain('Tarify_Magazina_na_Kaspi_kz_2026.pdf')
  })

  it.each(pages)('%s states the delivery split (under 10 000 by order amount 49 to 799, weight from 10 000) and drops the unconfirmed "not withheld" claim', file => {
    const src = read(file)
    expect(src).toContain('49')
    expect(src).toContain('799')
    expect(src).toContain('10 000')
    expect(src).not.toContain('Не удерживаются маркетплейсом')
    expect(src).not.toContain('Маркетплейс ұстамайды')
  })

  it('the kk guide carries the native-speaker review marker', () => {
    expect(read(pages[1]).startsWith('// kk: вычитка носителем ждёт основателя')).toBe(true)
  })

  it('the margin FAQ no longer cites the 28.01.2026 edition in any language', () => {
    expect(read('src/app/tools/margin/dict.ts')).not.toContain('28.01.2026')
    expect(read('src/app/tools/margin/dict.ts')).not.toContain('28 January 2026')
  })
})
