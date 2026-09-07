import { describe, it, expect } from 'vitest'
import { calculateMargin, MarginInput } from './marginCalc'

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
