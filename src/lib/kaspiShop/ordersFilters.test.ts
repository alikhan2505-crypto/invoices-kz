import { describe, it, expect } from 'vitest'
import { filterByDeliveryCutoff, deliveryDueLabel } from './ordersFilters'

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

describe('deliveryDueLabel', () => {
  // 15:00 по Алматы, 23 августа
  const NOW = new Date('2026-08-23T10:00:00.000Z')

  it('нет срока или он не читается: подписи нет', () => {
    expect(deliveryDueLabel(null, NOW)).toBeNull()
    expect(deliveryDueLabel('не дата', NOW)).toBeNull()
  })
  it('сегодня и просрочено срочные, завтра и дальше спокойные', () => {
    expect(deliveryDueLabel('2026-08-23T15:00:00.000Z', NOW)).toEqual({ text: 'Передать сегодня', urgent: true })
    expect(deliveryDueLabel('2026-08-24T15:00:00.000Z', NOW)).toEqual({ text: 'Передать завтра', urgent: false })
    const late = deliveryDueLabel('2026-08-21T15:00:00.000Z', NOW)!
    expect(late.urgent).toBe(true)
    expect(late.text.startsWith('Просрочен, ')).toBe(true)
    const far = deliveryDueLabel('2026-08-30T15:00:00.000Z', NOW)!
    expect(far.urgent).toBe(false)
    expect(far.text.startsWith('Передать до ')).toBe(true)
  })
  it('граница суток по Алматы: 01:30 по Алматы уже следующий день, хотя по UTC ещё вчера', () => {
    // 23 августа 20:30 UTC = 24 августа 01:30 по Алматы
    const justAfterMidnight = new Date('2026-08-23T20:30:00.000Z')
    expect(deliveryDueLabel('2026-08-24T15:00:00.000Z', justAfterMidnight)).toEqual({ text: 'Передать сегодня', urgent: true })
  })
})
