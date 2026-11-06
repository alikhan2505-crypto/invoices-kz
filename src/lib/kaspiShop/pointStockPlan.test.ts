import { describe, it, expect } from 'vitest'
import { planCityStockSaves, sameCityPriceMismatches, type PointDraft } from './pointStockPlan'

// Магазин из аудита K24: две точки в Алматы по 1200 и одна в Астане.
function pt(over: Partial<PointDraft> & { storeCode: string }): PointDraft {
  return {
    cityId: 'ALM', cityName: 'Алматы',
    initialPrice: '1200', price: '1200', initialStock: '5', stockCount: '5',
    ...over,
  }
}
const PP1 = (o: Partial<PointDraft> = {}) => pt({ storeCode: 'PP1', ...o })
const PP2 = (o: Partial<PointDraft> = {}) => pt({ storeCode: 'PP2', ...o })
const AST = (o: Partial<PointDraft> = {}) => pt({ storeCode: 'PP3', cityId: 'AST', cityName: 'Астана', initialPrice: '1300', price: '1300', ...o })

describe('K24: одна цена на город', () => {
  it('сценарий из аудита: PP1 -> 1500, PP2 не трогали: уходит ТОЛЬКО PP1, PP2 не отправляется и не откатывает цену', () => {
    const plan = planCityStockSaves([PP1({ price: '1500' }), PP2(), AST()])
    expect(plan.errors).toEqual([])
    expect(plan.entries).toEqual([{ storeCode: 'PP1', cityId: 'ALM', price: 1500, stockCount: 5 }])
  })

  it('нетронутые точки не отправляются вообще (не тратят бюджет изменений)', () => {
    const plan = planCityStockSaves([PP1(), PP2(), AST()])
    expect(plan.entries).toEqual([])
    expect(plan.errors).toEqual([])
  })

  it('цена PP1 изменена, у PP2 только остаток: оба уходят с ОДНОЙ ценой города, PP2 не откатывает', () => {
    const plan = planCityStockSaves([PP1({ price: '1500' }), PP2({ stockCount: '9' })])
    expect(plan.errors).toEqual([])
    expect(plan.entries).toEqual([
      { storeCode: 'PP1', cityId: 'ALM', price: 1500, stockCount: 5 },
      { storeCode: 'PP2', cityId: 'ALM', price: 1500, stockCount: 9 },
    ])
  })

  it('у двух точек одного города разные НОВЫЕ цены: блокируем, одна затёрла бы другую', () => {
    const plan = planCityStockSaves([PP1({ price: '1500' }), PP2({ price: '1400' })])
    expect(plan.entries).toEqual([])
    expect(plan.errors).toHaveLength(1)
    expect(plan.errors[0]).toContain('Алматы')
    expect(plan.errors[0]).toContain('разные новые цены')
  })

  it('те же новые цены у двух точек города: ок, уходят обе с одной ценой', () => {
    const plan = planCityStockSaves([PP1({ price: '1500' }), PP2({ price: '1 500' })])
    expect(plan.errors).toEqual([])
    expect(plan.entries.map(e => e.price)).toEqual([1500, 1500])
  })

  it('нетронутая соседняя точка показывала другую цену: предупреждение, не блокировка', () => {
    const plan = planCityStockSaves([PP1({ price: '1500' }), PP2({ initialPrice: '1100', price: '1100' })])
    expect(plan.errors).toEqual([])
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toContain('цена в Kaspi одна на весь город')
    expect(plan.warnings[0]).toContain('1')
    expect(plan.entries).toEqual([{ storeCode: 'PP1', cityId: 'ALM', price: 1500, stockCount: 5 }])
  })

  it('разные города независимы', () => {
    const plan = planCityStockSaves([PP1({ price: '1500' }), AST({ price: '1400' })])
    expect(plan.errors).toEqual([])
    expect(plan.entries).toEqual([
      { storeCode: 'PP1', cityId: 'ALM', price: 1500, stockCount: 5 },
      { storeCode: 'PP3', cityId: 'AST', price: 1400, stockCount: 5 },
    ])
  })
})

describe('остаток', () => {
  it('изменили только остаток: точка уходит со своей ценой', () => {
    const plan = planCityStockSaves([PP1({ stockCount: '7' })])
    expect(plan.entries).toEqual([{ storeCode: 'PP1', cityId: 'ALM', price: 1200, stockCount: 7 }])
  })

  it('очистили остаток: уходит null (как раньше, это снимает запомненный остаток)', () => {
    const plan = planCityStockSaves([PP1({ stockCount: '' })])
    expect(plan.entries).toEqual([{ storeCode: 'PP1', cityId: 'ALM', price: 1200, stockCount: null }])
  })

  it('точка без остатка: ввели число - изменение; не трогали - нет', () => {
    expect(planCityStockSaves([PP1({ initialStock: '', stockCount: '' })]).entries).toEqual([])
    expect(planCityStockSaves([PP1({ initialStock: '', stockCount: '3' })]).entries).toHaveLength(1)
  })

  it('дробный и отрицательный остаток - ошибка', () => {
    expect(planCityStockSaves([PP1({ stockCount: '2,5' })]).errors[0]).toContain('целым числом')
    expect(planCityStockSaves([PP1({ stockCount: '-1' })]).errors).toHaveLength(1)
    expect(planCityStockSaves([PP1({ stockCount: 'abc' })]).errors).toHaveLength(1)
  })
})

describe('проверки цены', () => {
  it('цену очистили: ошибка, а не отправка нуля', () => {
    const plan = planCityStockSaves([PP1({ price: '' })])
    expect(plan.entries).toEqual([])
    expect(plan.errors[0]).toContain('заполните поле')
  })

  it('ноль и мусор отвергаются', () => {
    expect(planCityStockSaves([PP1({ price: '0' })]).errors[0]).toContain('больше нуля')
    expect(planCityStockSaves([PP1({ price: 'abc' })]).errors).toHaveLength(1)
  })

  it('запятая и пробелы в цене', () => {
    const plan = planCityStockSaves([PP1({ price: '1 250,5' })])
    expect(plan.entries[0].price).toBe(1250.5)
  })

  it('«1 200» и «1200» - одно и то же, это не изменение', () => {
    expect(planCityStockSaves([PP1({ price: '1 200' })]).entries).toEqual([])
  })

  it('изменённая точка без города - ошибка; нетронутая без города молча пропускается', () => {
    expect(planCityStockSaves([PP1({ cityId: null, price: '1500' })]).errors[0]).toContain('нет города')
    expect(planCityStockSaves([PP1({ cityId: null })]).errors).toEqual([])
  })
})

describe('sameCityPriceMismatches: живое предупреждение', () => {
  it('точки одного города с разной ценой', () => {
    const m = sameCityPriceMismatches([
      { cityId: 'ALM', cityName: 'Алматы', price: '1500' },
      { cityId: 'ALM', cityName: 'Алматы', price: '1200' },
      { cityId: 'AST', cityName: 'Астана', price: '1300' },
    ])
    expect(m).toEqual([{ cityId: 'ALM', cityName: 'Алматы', prices: [1200, 1500] }])
  })

  it('одинаковые или непонятные цены: без предупреждения', () => {
    expect(sameCityPriceMismatches([
      { cityId: 'ALM', cityName: 'Алматы', price: '1200' },
      { cityId: 'ALM', cityName: 'Алматы', price: '1 200' },
      { cityId: 'ALM', cityName: 'Алматы', price: 'abc' },
      { cityId: null, cityName: null, price: '5' },
    ])).toEqual([])
  })
})
