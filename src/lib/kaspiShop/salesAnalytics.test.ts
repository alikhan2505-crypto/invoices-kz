import { describe, it, expect } from 'vitest'
import { extractAttributes, computeAbc, computeAttributeSlices } from './salesAnalytics'
import { Order } from './cabinetApi'

function order(items: { code: string; name: string; quantity: number; totalPrice: number }[]): Order {
  return {
    code: 'ORDER',
    status: 'ARCHIVED',
    customerFirstName: 'Тест',
    customerLastName: 'Тестов',
    totalPrice: items.reduce((s, i) => s + i.totalPrice, 0),
    creationTime: '2026-08-01T10:00:00Z',
    items: items.map(i => ({ ...i, imageUrl: null })),
  }
}

describe('extractAttributes', () => {
  it('finds RU colors with declensions and normalizes ё/е', () => {
    expect(extractAttributes('Лонгслив Abil.Sisters бордовый').color).toBe('Бордовый')
    expect(extractAttributes('Футболка черная женская').color).toBe('Чёрный')
    expect(extractAttributes('Дженга Настольная игра "Башня"').color).toBeNull()
  })

  it('finds standalone letter sizes but not letters inside words', () => {
    expect(extractAttributes('Влажные полотенца Sunlight 70шт XXL Universal 70 шт').size).toBe('XXL')
    // The S in "Sunlight" and L in "Universal" must not match.
    expect(extractAttributes('Полотенца Sunlight Universal').size).toBeNull()
    expect(extractAttributes('Футболка M белая').size).toBe('M')
  })

  it('accepts standalone numeric clothing sizes 38-58, ignores quantities', () => {
    expect(extractAttributes('Джинсы женские 44 синие').size).toBe('44')
    expect(extractAttributes('Салфетки 70 шт').size).toBeNull()
  })
})

describe('computeAbc', () => {
  it('classifies by cumulative revenue share: <=80% A, <=95% B, rest C', () => {
    const rows = computeAbc([order([
      { code: 'p1', name: 'Хит', quantity: 8, totalPrice: 80000 },
      { code: 'p2', name: 'Середняк', quantity: 3, totalPrice: 15000 },
      { code: 'p3', name: 'Хвост', quantity: 1, totalPrice: 5000 },
    ])])
    expect(rows.map(r => [r.code, r.abcClass])).toEqual([['p1', 'A'], ['p2', 'B'], ['p3', 'C']])
    expect(rows[0].share).toBeCloseTo(0.8)
    expect(rows[2].cumulativeShare).toBeCloseTo(1)
  })

  it('returns empty for no revenue', () => {
    expect(computeAbc([])).toEqual([])
  })
})

describe('computeAttributeSlices', () => {
  it('aggregates by extracted color and size, skipping items with neither', () => {
    const { byColor, bySize } = computeAttributeSlices([order([
      { code: 'p1', name: 'Лонгслив бордовый L', quantity: 2, totalPrice: 7800 },
      { code: 'p2', name: 'Лонгслив бордовый M', quantity: 1, totalPrice: 3900 },
      { code: 'p3', name: 'Дженга Башня', quantity: 1, totalPrice: 50000 },
    ])])
    expect(byColor).toEqual([{ value: 'Бордовый', unitsSold: 3, revenue: 11700 }])
    expect(bySize.map(s => s.value).sort()).toEqual(['L', 'M'])
  })
})
