import { describe, it, expect } from 'vitest'
import { filterByDeliveryCutoff, collectDistinctCityNames } from './ordersFilters'

describe('filterByDeliveryCutoff', () => {
  const NOW = new Date('2026-08-23T10:00:00.000Z') // 15:00 Almaty time

  it("mode 'all' returns every order unchanged", () => {
    const orders = [{ plannedDeliveryDate: null }, { plannedDeliveryDate: '2026-08-30T00:00:00.000Z' }]
    expect(filterByDeliveryCutoff(orders, 'all', NOW)).toEqual(orders)
  })

  it("mode 'tomorrow' keeps orders due by tomorrow 20:00 Almaty time (15:00 UTC on 2026-08-24)", () => {
    const dueToday = { plannedDeliveryDate: '2026-08-23T09:00:00.000Z' }
    const dueTomorrowMorning = { plannedDeliveryDate: '2026-08-24T05:00:00.000Z' }
    const dueTomorrowAtCutoff = { plannedDeliveryDate: '2026-08-24T15:00:00.000Z' }
    const dueAfterCutoff = { plannedDeliveryDate: '2026-08-24T15:00:00.001Z' }
    const dueDayAfter = { plannedDeliveryDate: '2026-08-25T00:00:00.000Z' }
    const result = filterByDeliveryCutoff(
      [dueToday, dueTomorrowMorning, dueTomorrowAtCutoff, dueAfterCutoff, dueDayAfter],
      'tomorrow',
      NOW
    )
    expect(result).toEqual([dueToday, dueTomorrowMorning, dueTomorrowAtCutoff])
  })

  it("mode 'tomorrow' drops orders with no planned delivery date", () => {
    expect(filterByDeliveryCutoff([{ plannedDeliveryDate: null }], 'tomorrow', NOW)).toEqual([])
  })
})

describe('collectDistinctCityNames', () => {
  it('dedupes by name and sorts (ru locale)', () => {
    const orders = [
      { cityName: 'Шымкент' },
      { cityName: 'Алматы' },
      { cityName: 'Шымкент' },
    ]
    expect(collectDistinctCityNames(orders)).toEqual(['Алматы', 'Шымкент'])
  })

  it('skips orders with a missing city name', () => {
    const orders = [{ cityName: null }, { cityName: 'Алматы' }]
    expect(collectDistinctCityNames(orders)).toEqual(['Алматы'])
  })

  it('returns an empty array for no orders', () => {
    expect(collectDistinctCityNames([])).toEqual([])
  })
})
