import { describe, it, expect } from 'vitest'
import { calculateMargin, MarginInput } from './marginCalc'
import { kaspiDeliveryTariff, ceilPrice, type KaspiDeliveryDirection } from './kaspiShop/margin'

const base: MarginInput = {
  costPrice: 5000,
  sellPrice: 10000,
  commissionPercent: 10,
  deliveryCost: 800,
  taxPercent: 3,
  otherCosts: 200,
  monthlyUnits: 30,
}

describe('calculateMargin', () => {
  it('charges commission and tax on the selling price, not the cost', () => {
    const r = calculateMargin(base)
    expect(r.commission).toBe(1000)
    expect(r.tax).toBe(300)
  })

  it('computes profit, margin and markup for a normal sale', () => {
    const r = calculateMargin(base)
    // 10000 - (5000 + 800 + 200 + 1000 + 300) = 2700
    expect(r.totalCosts).toBe(7300)
    expect(r.profitPerUnit).toBe(2700)
    expect(r.marginPercent).toBeCloseTo(27, 6)
    expect(r.markupPercent).toBeCloseTo(54, 6)
  })

  it('reports a loss rather than clamping it at zero', () => {
    const r = calculateMargin({ ...base, sellPrice: 6000 })
    // 6000 - (5000 + 800 + 200 + 600 + 180) = -780
    expect(r.profitPerUnit).toBe(-780)
    expect(r.marginPercent).toBeLessThan(0)
    expect(r.monthlyProfit).toBe(-780 * 30)
  })

  // The whole reason this module exists: the floor price has to be solved for,
  // because raising the price also raises the commission taken off it.
  it('solves the break-even price instead of just summing the costs', () => {
    const r = calculateMargin(base)
    // fixed = 6000, taken = 13%  =>  6000 / 0.87
    expect(r.breakEvenPrice).toBeCloseTo(6896.5517, 3)
    expect(r.breakEvenPrice).toBeGreaterThan(6000)
  })

  it('break-even price actually breaks even when fed back in', () => {
    const r = calculateMargin(base)
    const atFloor = calculateMargin({ ...base, sellPrice: r.breakEvenPrice! })
    expect(atFloor.profitPerUnit).toBeCloseTo(0, 6)
  })

  it('has no break-even price when commission and tax take everything', () => {
    expect(calculateMargin({ ...base, commissionPercent: 97, taxPercent: 3 }).breakEvenPrice).toBeNull()
    expect(calculateMargin({ ...base, commissionPercent: 99, taxPercent: 5 }).breakEvenPrice).toBeNull()
  })

  it('leaves markup undefined when there is no cost price to mark up', () => {
    const r = calculateMargin({ ...base, costPrice: 0 })
    expect(r.markupPercent).toBeNull()
    expect(r.marginPercent).toBeGreaterThan(0)
  })

  it('returns zeroes for an empty form instead of NaN', () => {
    const r = calculateMargin({
      costPrice: 0, sellPrice: 0, commissionPercent: 0,
      deliveryCost: 0, taxPercent: 0, otherCosts: 0, monthlyUnits: 0,
    })
    expect(r.profitPerUnit).toBe(0)
    expect(r.marginPercent).toBe(0)
    expect(r.monthlyProfit).toBe(0)
    expect(r.breakEvenPrice).toBe(0)
    expect(Object.values(r).every(v => v === null || Number.isFinite(v))).toBe(true)
  })

  it('treats negative and non-numeric input as zero', () => {
    const r = calculateMargin({ ...base, costPrice: -5000, deliveryCost: NaN })
    expect(r.totalCosts).toBe(200 + 1000 + 300)
    expect(Number.isFinite(r.profitPerUnit)).toBe(true)
  })

  it('caps a percentage typed above 100 so profit cannot rise as price falls', () => {
    const r = calculateMargin({ ...base, commissionPercent: 500 })
    expect(r.commission).toBe(10000)
    expect(r.breakEvenPrice).toBeNull()
  })

  it('scales the monthly figures by the number of sales', () => {
    const r = calculateMargin(base)
    expect(r.monthlyRevenue).toBe(300000)
    expect(r.monthlyProfit).toBe(81000)
  })
})

// Ревью 05.11.2026: тариф Kaspi зависит от цены, и «Минимальная цена» из одной формулы врала.
describe('calculateMargin: break-even with the Kaspi delivery tariff', () => {
  // Состояние /tools/margin по умолчанию: себестоимость 5000, цена 10000, комиссия 12,5, налог 4, прочее 200, город с НДС.
  const tool: MarginInput = { costPrice: 5000, sellPrice: 10000, commissionPercent: 12.5, deliveryCost: 1275, taxPercent: 4, otherCosts: 200, monthlyUnits: 30 }
  const city = kaspiDeliveryTariff({ direction: 'city', withVat: true })

  it('default tool state: the floor is 7 199 ₸ (root 7 198,8, delivery 811 below 10 000), not 7 754 from the delivery of the current price', () => {
    expect(calculateMargin(tool).breakEvenPrice).toBeCloseTo(6475 / 0.835, 6) // прежний результат: 7 754
    const r = calculateMargin(tool, { deliveryTariff: city })
    expect(r.breakEvenPrice).toBeCloseTo(6011 / 0.835, 6)
    expect(ceilPrice(r.breakEvenPrice as number)).toBe(7199)
    // На показанной цене и выше прибыль не отрицательна, на 1 ₸ ниже убыток.
    const at = (p: number) => calculateMargin({ ...tool, sellPrice: p, deliveryCost: city.feeAt(p) }).profitPerUnit
    expect(at(7199)).toBeGreaterThanOrEqual(0)
    expect(at(7198)).toBeLessThan(0)
  })

  it('a seller at 4 900 ₸ is not told that 5 307 ₸ is safe (it loses money at delivery 811)', () => {
    const cheap = { ...tool, costPrice: 4000, sellPrice: 4900, deliveryCost: 231 }
    expect(calculateMargin(cheap).breakEvenPrice).toBeCloseTo(4431 / 0.835, 6) // прежний результат 5 307, а на нём убыток
    const at = (p: number) => calculateMargin({ ...cheap, sellPrice: p, deliveryCost: city.feeAt(p) }).profitPerUnit
    expect(at(5307)).toBeLessThan(0)
    const r = calculateMargin(cheap, { deliveryTariff: city })
    expect(r.breakEvenPrice).toBeCloseTo(5011 / 0.835, 6)
    expect(at(ceilPrice(r.breakEvenPrice as number))).toBeGreaterThanOrEqual(0)
  })

  it('the profit shown still uses the delivery of the current price', () => {
    expect(calculateMargin(tool, { deliveryTariff: city }).profitPerUnit).toBe(calculateMargin(tool).profitPerUnit)
  })

  it('brute force over random tool inputs: nothing above the floor loses money, one tenge below the floor does', () => {
    let a = 77
    const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296 }
    const dirs: KaspiDeliveryDirection[] = ['city', 'kazakhstan', 'express']
    for (let n = 0; n < 200; n++) {
      const tariff = kaspiDeliveryTariff({ direction: dirs[Math.floor(rnd() * 3)], withVat: rnd() < 0.7, weightKg: rnd() < 0.4 ? 0 : rnd() * 120 })
      const input: MarginInput = {
        costPrice: Math.round(10 ** (rnd() * 4.6)), sellPrice: 10000, commissionPercent: 5 + rnd() * 12, deliveryCost: 0,
        taxPercent: Math.round(rnd() * 6), otherCosts: Math.round(rnd() * 1500), monthlyUnits: 1,
      }
      const floor = calculateMargin(input, { deliveryTariff: tariff }).breakEvenPrice as number
      const profit = (p: number) => calculateMargin({ ...input, sellPrice: p, deliveryCost: tariff.feeAt(p) }).profitPerUnit
      expect(profit(floor)).toBeGreaterThanOrEqual(-1e-6)
      const start = ceilPrice(floor)
      for (let p = start; p <= start + Math.max(0, 12000 - start) + 300; p++) {
        if (profit(p) < -1e-6) throw new Error(`loss at ${p}, floor ${floor}`)
      }
      const below = Math.floor(floor - 1e-6)
      if (below >= 0) expect(profit(below)).toBeLessThan(0)
    }
  })

  it('without a tariff (own delivery or pickup) the floor stays the closed formula', () => {
    expect(calculateMargin({ ...tool, deliveryCost: 0 }).breakEvenPrice).toBeCloseTo(5200 / 0.835, 6)
  })
})
