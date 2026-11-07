import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  computeMargin,
  computeVerdict,
  effectiveCommissionPercent,
  kaspiDeliveryFee,
  kaspiDeliveryQuote,
  KASPI_CATEGORY_COMMISSIONS,
  KASPI_DELIVERY_DIRECTIONS,
  KASPI_DELIVERY_VAT_PERCENT,
  KASPI_PROMO_RATE_BY_RATE,
  promoRateFor,
  rateOnSaleTypeSwitch,
  regularRateFor,
  DEFAULT_CARGO_RATE_PER_KG,
  DEFAULT_TARGET_MARGIN_PERCENT, computeBreakEvenPrice } from './margin'
import { Z2_VAT_RATE } from '../nakladnayaZ2'

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

// Официальная сетка Kaspi Доставки с 01.01.2026, цены БЕЗ НДС (страница Kaspi q2288,
// Express q2953; сверено 17.10.2026). Продублирована в тесте ЦИФРАМИ, а не берётся из
// KASPI_DELIVERY: тест должен упасть, если кто-то поправит таблицу и забудет сверить.
const OFFICIAL = {
  amount: [
    // [сумма заказа внутри строки, город, Казахстан, Express]
    [1, 49, 49, 49],
    [999, 49, 49, 49],
    [1000, 149, 149, 149],
    [2999, 149, 149, 149],
    [3000, 199, 199, 199],
    [4999, 199, 199, 199],
    [5000, 699, 799, 799],
    [9999, 699, 799, 799],
  ],
  weight: [
    // [вес, кг, город, Казахстан, Express]
    [0.5, 1099, 1299, 1699],
    [5, 1099, 1299, 1699],
    [5.01, 1349, 1699, 1849],
    [15, 1349, 1699, 1849],
    [15.01, 2299, 3599, 3149],
    [30, 2299, 3599, 3149],
    [30.01, 2899, 5649, 3599],
    [60, 2899, 5649, 3599],
    [60.01, 4149, 8549, 5599],
    [100, 4149, 8549, 5599],
    [100.01, 6449, 11999, 8449],
    [500, 6449, 11999, 8449],
  ],
} as const

describe('kaspiDeliveryFee: official grid, amount below 10 000 (weight does not matter)', () => {
  it.each(OFFICIAL.amount)('order %i: city %i, Kazakhstan %i, Express %i without VAT', (amount, city, kz, express) => {
    const fee = (direction: 'city' | 'kazakhstan' | 'express') =>
      kaspiDeliveryFee({ orderAmount: amount, direction, withVat: false })
    expect(fee('city')).toBe(city)
    expect(fee('kazakhstan')).toBe(kz)
    expect(fee('express')).toBe(express)
  })

  it('each amount boundary belongs to the upper row: 999/1000, 2999/3000, 4999/5000, 9999/10000', () => {
    const tier = (orderAmount: number) => kaspiDeliveryQuote({ orderAmount, direction: 'city', withVat: false }).tierId
    expect(tier(999)).toBe('lt1000')
    expect(tier(1000)).toBe('1000-3000')
    expect(tier(2999)).toBe('1000-3000')
    expect(tier(3000)).toBe('3000-5000')
    expect(tier(4999)).toBe('3000-5000')
    expect(tier(5000)).toBe('5000-10000')
    expect(tier(9999)).toBe('5000-10000')
    expect(tier(9999.99)).toBe('5000-10000')
    // Ровно 10 000: в таблице блок называется «10 000 ₸ и более», то есть уже по весу.
    expect(kaspiDeliveryQuote({ orderAmount: 10000, direction: 'city', withVat: false }).basis).toBe('weight')
    expect(kaspiDeliveryQuote({ orderAmount: 9999, direction: 'city', withVat: false }).basis).toBe('amount')
  })

  it('ignores weight below 10 000, even a huge one', () => {
    const q = kaspiDeliveryQuote({ orderAmount: 7000, weightKg: 250, direction: 'express', withVat: false })
    expect(q.basis).toBe('amount')
    expect(q.weightAssumed).toBe(false)
    expect(q.netTenge).toBe(799)
  })

  it('the step at 5 000 is the biggest one on the grid: 199 -> 699 in the city', () => {
    const before = kaspiDeliveryFee({ orderAmount: 4999, direction: 'city', withVat: false })
    const after = kaspiDeliveryFee({ orderAmount: 5000, direction: 'city', withVat: false })
    expect(after - before).toBe(500)
  })
})

describe('kaspiDeliveryFee: official grid, order from 10 000 (by weight)', () => {
  it.each(OFFICIAL.weight)('weight %f kg: city %i, Kazakhstan %i, Express %i without VAT', (kg, city, kz, express) => {
    const fee = (direction: 'city' | 'kazakhstan' | 'express') =>
      kaspiDeliveryFee({ orderAmount: 10000, weightKg: kg, direction, withVat: false })
    expect(fee('city')).toBe(city)
    expect(fee('kazakhstan')).toBe(kz)
    expect(fee('express')).toBe(express)
  })

  it('each weight boundary 5 / 15 / 30 / 60 / 100 kg stays in the row where it is the upper bound; "свыше 100" starts above it', () => {
    const tier = (weightKg: number) => kaspiDeliveryQuote({ orderAmount: 20000, weightKg, direction: 'city', withVat: false }).tierId
    expect(tier(5)).toBe('w-to5')
    expect(tier(5.01)).toBe('w-5-15')
    expect(tier(15)).toBe('w-5-15')
    expect(tier(15.01)).toBe('w-15-30')
    expect(tier(30)).toBe('w-15-30')
    expect(tier(30.01)).toBe('w-30-60')
    expect(tier(60)).toBe('w-30-60')
    expect(tier(60.01)).toBe('w-60-100')
    expect(tier(100)).toBe('w-60-100')
    expect(tier(100.01)).toBe('w-over100')
  })

  it('without a weight takes the lightest row and says so (weightAssumed)', () => {
    for (const weightKg of [undefined, 0, -3, NaN]) {
      const q = kaspiDeliveryQuote({ orderAmount: 10000, weightKg, direction: 'city', withVat: false })
      expect(q.tierId).toBe('w-to5')
      expect(q.weightAssumed).toBe(true)
      expect(q.netTenge).toBe(1099)
    }
    expect(kaspiDeliveryQuote({ orderAmount: 10000, weightKg: 2, direction: 'city', withVat: false }).weightAssumed).toBe(false)
  })

  it('a heavier parcel is never cheaper in any direction', () => {
    for (const direction of KASPI_DELIVERY_DIRECTIONS) {
      const fees = [1, 6, 16, 31, 61, 101].map(weightKg => kaspiDeliveryFee({ orderAmount: 50000, weightKg, direction, withVat: false }))
      for (let i = 1; i < fees.length; i++) expect(fees[i], direction).toBeGreaterThan(fees[i - 1])
    }
  })

  it('the Kazakhstan column is the dearest from 15 kg up, the city the cheapest in every row', () => {
    for (const weightKg of [3, 10, 20, 45, 80, 150]) {
      const f = (direction: 'city' | 'kazakhstan' | 'express') =>
        kaspiDeliveryFee({ orderAmount: 30000, weightKg, direction, withVat: false })
      expect(f('city'), `${weightKg} kg`).toBeLessThan(f('express'))
      expect(f('city'), `${weightKg} kg`).toBeLessThan(f('kazakhstan'))
    }
  })
})

describe('kaspiDeliveryFee: VAT on delivery', () => {
  it('the VAT rate is the project 16% (same constant as the waybill Z-2 tool)', () => {
    expect(KASPI_DELIVERY_VAT_PERCENT).toBe(16)
    expect(KASPI_DELIVERY_VAT_PERCENT).toBe(Z2_VAT_RATE)
  })

  it('adds 16% and rounds to a whole tenge: 1099 -> 1275, 49 -> 57, 699 -> 811', () => {
    const fee = (orderAmount: number, weightKg?: number) => kaspiDeliveryFee({ orderAmount, weightKg, direction: 'city', withVat: true })
    expect(fee(10000, 3)).toBe(1275) // 1099 * 1.16 = 1274.84
    expect(fee(500)).toBe(57) // 49 * 1.16 = 56.84
    expect(fee(6000)).toBe(811) // 699 * 1.16 = 810.84
    expect(fee(10000, 200)).toBe(7481) // 6449 * 1.16 = 7480.84
  })

  it('without VAT it returns the published number as is', () => {
    expect(kaspiDeliveryFee({ orderAmount: 10000, weightKg: 3, direction: 'city', withVat: false })).toBe(1099)
  })

  it('net + vat = total in the quote, and vat is 0 when switched off', () => {
    for (const orderAmount of [500, 2000, 4000, 6000, 12000]) {
      for (const direction of KASPI_DELIVERY_DIRECTIONS) {
        const on = kaspiDeliveryQuote({ orderAmount, weightKg: 7, direction, withVat: true })
        const off = kaspiDeliveryQuote({ orderAmount, weightKg: 7, direction, withVat: false })
        expect(on.netTenge + on.vatTenge).toBe(on.totalTenge)
        expect(on.netTenge).toBe(off.netTenge)
        expect(off.vatTenge).toBe(0)
        expect(off.totalTenge).toBe(off.netTenge)
        expect(on.totalTenge).toBeGreaterThan(off.totalTenge)
        expect(Number.isInteger(on.totalTenge)).toBe(true)
      }
    }
  })

  it('garbage in the amount (empty, NaN, negative) is treated as the lowest row, never throws', () => {
    for (const orderAmount of [0, -100, NaN, Infinity * 0]) {
      expect(kaspiDeliveryFee({ orderAmount, direction: 'express', withVat: false })).toBe(49)
    }
  })
})

describe('Kaspi promo rates (Тарифы акций Магазина с 05.01.2026)', () => {
  it('maps the three published tiers: 12,5 -> 13,0, 7,3 -> 7,7, 15,5 -> 16,1', () => {
    expect(KASPI_PROMO_RATE_BY_RATE).toEqual({ '7.3': 7.7, '12.5': 13.0, '15.5': 16.1 })
    expect(promoRateFor(12.5)).toBe(13)
    expect(promoRateFor(7.3)).toBe(7.7)
    expect(promoRateFor(15.5)).toBe(16.1)
  })

  it('does not invent a promo rate for anything else (custom rate, mixed Аксессуары, zero)', () => {
    for (const r of [0, 10, 11, 12, 13, 14, 16.1, 20]) expect(promoRateFor(r), String(r)).toBeNull()
    expect(KASPI_CATEGORY_COMMISSIONS.some(c => c.label === 'Аксессуары')).toBe(false)
  })

  it('regularRateFor is the inverse and refuses unknown values', () => {
    expect(regularRateFor(13)).toBe(12.5)
    expect(regularRateFor(7.7)).toBe(7.3)
    expect(regularRateFor(16.1)).toBe(15.5)
    expect(regularRateFor(12.5)).toBeNull()
    expect(regularRateFor(14)).toBeNull()
  })

  it('every category carries the promo rate of its own tier, always above the regular one', () => {
    for (const c of KASPI_CATEGORY_COMMISSIONS) {
      expect(Number.isFinite(c.promoRatePercent), c.label).toBe(true)
      expect(c.promoRatePercent, c.label).toBe(KASPI_PROMO_RATE_BY_RATE[String(c.ratePercent)])
      expect(c.promoRatePercent, c.label).toBeGreaterThan(c.ratePercent)
      expect(c.promoRatePercent - c.ratePercent, c.label).toBeLessThan(1)
    }
    const promo = (label: string) => KASPI_CATEGORY_COMMISSIONS.find(c => c.label === label)?.promoRatePercent
    expect(promo('Автотовары')).toBe(13)
    expect(promo('Продукты питания')).toBe(7.7)
    expect(promo('Аптека — лекарства')).toBe(7.7)
    expect(promo('Украшения')).toBe(16.1)
    expect(promo('Телефоны и гаджеты — аксессуары (чехлы, кабели, стёкла)')).toBe(16.1)
  })

  it('the regular rates are untouched by the promo column', () => {
    const regular = new Set(KASPI_CATEGORY_COMMISSIONS.map(c => c.ratePercent))
    expect([...regular].sort((a, b) => a - b)).toEqual([7.3, 12.5, 15.5])
  })
})

describe('effectiveCommissionPercent: sale type and the 0-0-24 surcharge', () => {
  it('regular and promo ignore the surcharge: Red 0-0-3/6/12, credit and another bank card add nothing', () => {
    expect(effectiveCommissionPercent(12.5, 'regular', 3)).toBe(12.5)
    expect(effectiveCommissionPercent(13, 'promo', 3)).toBe(13)
  })

  it('promo24 adds the surcharge in percentage points to the promo rate', () => {
    expect(effectiveCommissionPercent(13, 'promo24', 0)).toBe(13)
    expect(effectiveCommissionPercent(13, 'promo24', 1)).toBe(14)
    expect(effectiveCommissionPercent(7.7, 'promo24', 0.3)).toBe(8)
    expect(effectiveCommissionPercent(16.1, 'promo24', 2.4)).toBe(18.5)
  })

  it('has no float noise (7,7 + 0,3 is exactly 8) and treats garbage and negatives as zero', () => {
    expect(effectiveCommissionPercent(7.7, 'promo24', 0.3)).toBe(8)
    expect(effectiveCommissionPercent(13, 'promo24', -2)).toBe(13)
    expect(effectiveCommissionPercent(13, 'promo24', NaN)).toBe(13)
    expect(effectiveCommissionPercent(NaN, 'promo24', 1)).toBe(1)
    expect(effectiveCommissionPercent(-5, 'regular', 0)).toBe(0)
  })

  it('feeds the margin math: a promo costs 0,5% of the price on a 12,5% category, 0-0-24 costs more by the surcharge', () => {
    const base = { kaspiPrice: 10000, sourcingPrice: 3000, weightGrams: 0, cargoRatePerKgTenge: 0, packagingCost: 0, deliveryFee: 0 }
    const regular = computeMargin({ ...base, commissionRatePercent: effectiveCommissionPercent(12.5, 'regular', 0) })
    const promo = computeMargin({ ...base, commissionRatePercent: effectiveCommissionPercent(13, 'promo', 0) })
    const promo24 = computeMargin({ ...base, commissionRatePercent: effectiveCommissionPercent(13, 'promo24', 1.5) })
    expect(regular.commissionAmount).toBe(1250)
    expect(promo.commissionAmount).toBe(1300)
    expect(regular.profit - promo.profit).toBeCloseTo(50, 6)
    expect(promo24.commissionAmount).toBe(1450)
    expect(promo.profit - promo24.profit).toBeCloseTo(150, 6)
  })
})

describe('rateOnSaleTypeSwitch: what the commission field does when the sale type changes', () => {
  it('uses the chosen category: its regular or its promo rate', () => {
    expect(rateOnSaleTypeSwitch('Автотовары', 12.5, true)).toBe(13)
    expect(rateOnSaleTypeSwitch('Автотовары', 13, false)).toBe(12.5)
    expect(rateOnSaleTypeSwitch('Продукты питания', 7.3, true)).toBe(7.7)
    expect(rateOnSaleTypeSwitch('Украшения', 15.5, true)).toBe(16.1)
  })

  it('without a category converts only the three published tiers, both ways', () => {
    expect(rateOnSaleTypeSwitch('', 12.5, true)).toBe(13)
    expect(rateOnSaleTypeSwitch('', 7.3, true)).toBe(7.7)
    expect(rateOnSaleTypeSwitch('', 15.5, true)).toBe(16.1)
    expect(rateOnSaleTypeSwitch('', 16.1, false)).toBe(15.5)
  })

  it('leaves a custom rate alone (null): no promo rate is invented for it', () => {
    expect(rateOnSaleTypeSwitch('', 11, true)).toBeNull()
    expect(rateOnSaleTypeSwitch('', 14, false)).toBeNull()
    expect(rateOnSaleTypeSwitch('', 0, true)).toBeNull()
  })
})

describe('the cabinet page and the margin source notes', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('the cabinet calculator takes the delivery from the official grid, the invented estimate is gone', () => {
    const page = read('src/app/kaspi-shop/margin/page.tsx')
    expect(page).toContain('autoDeliveryFee')
    expect(page).toContain('cityDeliveryTariff')
    expect(page).toContain('inputsAtPrice')
    expect(page).not.toContain('estimateKaspiDeliveryFee')
    expect(read('src/lib/kaspiShop/margin.ts')).not.toContain('estimateKaspiDeliveryFee')
  })

  it('margin.ts cites both PDFs (regular tariff and promo tariff) and the check dates', () => {
    const src = read('src/lib/kaspiShop/margin.ts')
    expect(src).toContain('Tarify_Magazina_na_Kaspi_kz_2026.pdf')
    expect(src).toContain('Tarify_Akciy_Magazina_na_Kaspi_kz_2026.pdf')
    expect(src).toContain('17.10.2026')
    expect(src).toContain('23.10.2026')
    expect(src).toContain('delivery/shipping/q2288')
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
