import { describe, it, expect } from 'vitest'
import {
  autoDeliveryFee,
  ceilPrice,
  cityDeliveryTariff,
  computeBreakEvenPrice,
  computeMargin,
  deliveryWeightAssumed,
  inputsAtPrice,
  kaspiDeliveryFee,
  kaspiDeliveryTariff,
  minProfitablePrice,
  type DeliveryTariff,
  type KaspiDeliveryDirection,
} from './margin'

// ---------------------------------------------------------------------------
// Безубыточная цена при тарифе доставки, который зависит от цены (ревью 05.11.2026).
// Раньше доставка была числом и порог P = fixed/(1-r) был верен; с сеткой Kaspi
// доставка в числителе скачет с ценой, и одна формула врала на сотни тенге.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('minProfitablePrice', () => {
  it('equals the closed formula when delivery is a constant', () => {
    expect(minProfitablePrice({ share: 0.125, fixed: 3000, delivery: 800 })).toBeCloseTo(3800 / 0.875, 9)
    expect(minProfitablePrice({ share: 0, fixed: 0, delivery: 0 })).toBe(0)
  })

  it('has no answer when the taken share is 100% or more', () => {
    expect(minProfitablePrice({ share: 1, fixed: 100, delivery: 0 })).toBeNull()
    expect(minProfitablePrice({ share: 1.2, fixed: 100, delivery: cityDeliveryTariff(0) })).toBeNull()
  })

  it('treats garbage as zero', () => {
    expect(minProfitablePrice({ share: NaN, fixed: -5, delivery: NaN })).toBe(0)
  })

  it('falls back to the first price of the band above when the whole band below loses money (decreasing tariff, synthetic)', () => {
    // Доставка 500 до 1000 ₸ и 100 от 1000 ₸: на [1000, ∞) корень 700 <= 1000, на [0, 1000) корень 1100 >= 1000.
    const odd: DeliveryTariff = { feeAt: p => (p < 1000 ? 500 : 100), breakpoints: [1000] }
    expect(minProfitablePrice({ share: 0, fixed: 600, delivery: odd })).toBe(1000)
  })

  it('a tariff with no breakpoints is a constant', () => {
    const flat: DeliveryTariff = { feeAt: () => 300, breakpoints: [] }
    expect(minProfitablePrice({ share: 0.1, fixed: 900, delivery: flat })).toBeCloseTo(1200 / 0.9, 9)
  })
})

describe('computeBreakEvenPrice with the Kaspi delivery tariff', () => {
  // Кабинет: закупка 3000, карго 500 г × 1500 = 750, упаковка 200 => fixed 3950, комиссия 12,5%.
  const costs = { commissionRatePercent: 12.5, sourcingPrice: 3000, weightGrams: 500, cargoRatePerKgTenge: 1500, packagingCost: 200, deliveryFee: 231 }
  const profitAt = (p: number) => computeMargin({ ...costs, kaspiPrice: p, deliveryFee: cityDeliveryTariff(500).feeAt(p) }).profit

  it('is not fooled by the delivery fee of the current price (the old formula said 4 778 for a seller typing 4 900)', () => {
    // Старая формула с доставкой 231 (цена 4 900): (3950 + 231) / 0.875 = 4 778.
    expect(computeBreakEvenPrice(costs).breakEven).toBeCloseTo(4181 / 0.875, 6)
    // С тарифом: на 5 000 ₸ доставка 811, и убыток длится до (3950 + 811) / 0.875 = 5 441,1.
    const { breakEven } = computeBreakEvenPrice(costs, 0, cityDeliveryTariff(500))
    expect(breakEven).toBeCloseTo(4761 / 0.875, 6)
    expect(profitAt(5000)).toBeLessThan(0)
    expect(profitAt(5440)).toBeLessThan(0)
    expect(profitAt(5442)).toBeGreaterThan(0)
  })

  it('a pocket of profit below a tier boundary stays below the floor: the floor is the lowest price above which every price earns', () => {
    // 4 800 ₸ в плюс (доставка ещё 231), 5 000 ₸ уже в минус (811): порог выше кармана.
    expect(profitAt(4800)).toBeGreaterThan(0)
    expect(profitAt(5000)).toBeLessThan(0)
    const { breakEven } = computeBreakEvenPrice(costs, 0, cityDeliveryTariff(500))
    expect(breakEven as number).toBeGreaterThan(5000)
  })

  it('the target margin price is solved by tier too', () => {
    const tariff = cityDeliveryTariff(500)
    const { atTargetMargin } = computeBreakEvenPrice(costs, 20, tariff)
    const at = computeMargin({ ...costs, kaspiPrice: atTargetMargin as number, deliveryFee: tariff.feeAt(atTargetMargin as number) })
    expect(at.marginPercent).toBeGreaterThanOrEqual(20 - 1e-6)
    // Ниже на 1 ₸ цель уже не достигается.
    const below = Math.floor((atTargetMargin as number) - 1e-6)
    const atBelow = computeMargin({ ...costs, kaspiPrice: below, deliveryFee: tariff.feeAt(below) })
    expect(atBelow.marginPercent).toBeLessThan(20)
  })

  it('a hand-typed delivery stays a constant (no tariff passed)', () => {
    expect(computeBreakEvenPrice({ ...costs, deliveryFee: 2000 }).breakEven).toBeCloseTo(5950 / 0.875, 6)
  })

  // Брутфорс: «любая цена выше порога не убыточна» и «порог минимальный» с шагом 1 ₸.
  it('brute force: profit >= 0 at the floor and for every whole price above it, and the floor is the lowest such price', () => {
    const rnd = mulberry32(20261105)
    const dirs: KaspiDeliveryDirection[] = ['city', 'kazakhstan', 'express']
    const rates = [7.3, 12.5, 15.5, 7.7, 13, 16.1, 14.5]
    let pockets = 0
    for (let n = 0; n < 300; n++) {
      const direction = dirs[Math.floor(rnd() * 3)]
      const withVat = rnd() < 0.7
      const weightKg = rnd() < 0.4 ? 0 : Math.round(rnd() * 120 * 10) / 10
      const rate = rates[Math.floor(rnd() * rates.length)]
      const sourcing = Math.round(10 ** (rnd() * 4.6))
      const packaging = Math.round(rnd() * 600)
      const inputs = { commissionRatePercent: rate, sourcingPrice: sourcing, weightGrams: 0, cargoRatePerKgTenge: 0, packagingCost: packaging, deliveryFee: 0 }
      const tariff = kaspiDeliveryTariff({ weightKg, direction, withVat })
      const { breakEven } = computeBreakEvenPrice(inputs, 0, tariff)
      expect(breakEven).not.toBeNull()
      const floor = breakEven as number
      const profit = (p: number) => computeMargin({ ...inputs, kaspiPrice: p, deliveryFee: tariff.feeAt(p) }).profit
      expect(profit(floor), `floor ${floor}`).toBeGreaterThanOrEqual(-1e-6)
      const start = ceilPrice(floor)
      const end = start + Math.max(0, 12000 - start) + 400
      for (let p = start; p <= end; p++) {
        if (profit(p) < -1e-6) throw new Error(`loss at ${p} above floor ${floor} (${direction}, vat ${withVat}, kg ${weightKg}, rate ${rate}, cost ${sourcing}+${packaging})`)
      }
      const below = Math.floor(floor - 1e-6)
      if (below >= 0) expect(profit(below), `below ${below}`).toBeLessThan(0)
      // Карман прибыли под порогом бывает: убеждаемся, что тест такие случаи вообще встречает.
      for (let p = Math.max(0, below - 1500); p < below; p += 7) {
        if (profit(p) > 0) { pockets++; break }
      }
    }
    expect(pockets).toBeGreaterThan(0)
  })
})

describe('cabinet delivery helpers', () => {
  it('autoDeliveryFee follows the city grid with VAT and never leaves a smaller tariff for a price from 10 000 ₸', () => {
    expect(autoDeliveryFee(4999, 0)).toBe(231)
    expect(autoDeliveryFee(5000, 0)).toBe(811)
    // От 10 000 ₸ без веса: строка «до 5 кг», 1 099 × 1,16 = 1 275, а не 811 от прежней цены.
    expect(autoDeliveryFee(12000, 0)).toBe(1275)
    expect(autoDeliveryFee(12000, 6000)).toBe(kaspiDeliveryFee({ orderAmount: 12000, weightKg: 6, direction: 'city', withVat: true }))
    expect(autoDeliveryFee(12000, 6000) as number).toBeGreaterThan(1275)
    expect(autoDeliveryFee(0, 0)).toBeNull()
    expect(autoDeliveryFee(NaN, 0)).toBeNull()
  })

  it('deliveryWeightAssumed is true only from 10 000 ₸ with no weight', () => {
    expect(deliveryWeightAssumed(12000, 0)).toBe(true)
    expect(deliveryWeightAssumed(10000, NaN)).toBe(true)
    expect(deliveryWeightAssumed(12000, 300)).toBe(false)
    expect(deliveryWeightAssumed(9999, 0)).toBe(false)
  })

  const base = { kaspiPrice: 10000, commissionRatePercent: 12.5, sourcingPrice: 3000, weightGrams: 0, cargoRatePerKgTenge: 0, packagingCost: 0, deliveryFee: 1275 }

  it('the what-if slider price gets its own delivery while the field was not edited by hand', () => {
    const r = inputsAtPrice(base, 7000, false)
    expect(r.kaspiPrice).toBe(7000)
    expect(r.deliveryFee).toBe(811)
    expect(inputsAtPrice(base, 4000, false).deliveryFee).toBe(231)
    // Прибыль на цене ползунка использует доставку именно этой цены.
    expect(computeMargin(r).profit).toBeCloseTo(7000 - 875 - 811 - 3000, 6)
  })

  it('a hand-edited delivery stays as typed at the slider price, and an empty price keeps the field', () => {
    expect(inputsAtPrice({ ...base, deliveryFee: 500 }, 4000, true).deliveryFee).toBe(500)
    expect(inputsAtPrice(base, 0, false).deliveryFee).toBe(1275)
  })
})

describe('ceilPrice', () => {
  it('rounds up to whole tenge but not past a root that is whole up to float noise', () => {
    expect(ceilPrice(7199.04)).toBe(7200)
    expect(ceilPrice(7199)).toBe(7199)
    expect(ceilPrice(7199.0000000001)).toBe(7199)
    expect(ceilPrice(0)).toBe(0)
  })
})

describe('root exactly on a tariff boundary', () => {
  it('does not jump to the upper tier because of float noise (review 06.11)', () => {
    const r = computeBreakEvenPrice(
      { sourcingPrice: 1494, weightGrams: 0, cargoRatePerKgTenge: 0, packagingCost: 0, commissionRatePercent: 12.5, deliveryFee: 0 },
      30,
      cityDeliveryTariff(0),
    )
    // тариф 1000-3000: доставка 173, (1494 + 173) / 0.575 = 2899, а не граница 3000
    expect(r.atTargetMargin).not.toBeNull()
    expect(Math.round(r.atTargetMargin as number)).toBe(2899)
  })
})
