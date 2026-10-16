import { describe, it, expect } from 'vitest'
import { waUsageMonthWindow, waUsageLevel, waUsageFraction, broadcastSentWithoutHistory, BROADCAST_HISTORY_SINCE_ISO } from './waUsage'

describe('waUsageMonthWindow', () => {
  it('месяц по Алматы: середина октября', () => {
    const w = waUsageMonthWindow(Date.parse('2026-10-16T08:00:00Z'))
    expect(w.startIso).toBe('2026-09-30T19:00:00.000Z')
    expect(w.resetIso).toBe('2026-10-31T19:00:00.000Z')
  })
  it('31.10 в 20:00 UTC в Алматы уже 1 ноября -- новый месяц', () => {
    const w = waUsageMonthWindow(Date.parse('2026-10-31T20:00:00Z'))
    expect(w.startIso).toBe('2026-10-31T19:00:00.000Z')
    expect(w.resetIso).toBe('2026-11-30T19:00:00.000Z')
  })
  it('31.10 в 18:59 UTC в Алматы ещё октябрь', () => {
    const w = waUsageMonthWindow(Date.parse('2026-10-31T18:59:00Z'))
    expect(w.startIso).toBe('2026-09-30T19:00:00.000Z')
  })
  it('декабрь переходит в январь следующего года', () => {
    const w = waUsageMonthWindow(Date.parse('2026-12-10T00:00:00Z'))
    expect(w.startIso).toBe('2026-11-30T19:00:00.000Z')
    expect(w.resetIso).toBe('2026-12-31T19:00:00.000Z')
  })
})

describe('waUsageLevel', () => {
  it('до 80% -- обычный', () => {
    expect(waUsageLevel(0, 1000)).toBe('normal')
    expect(waUsageLevel(799, 1000)).toBe('normal')
  })
  it('80–99% -- жёлтый', () => {
    expect(waUsageLevel(800, 1000)).toBe('warn')
    expect(waUsageLevel(999, 1000)).toBe('warn')
  })
  it('от 100% -- красный', () => {
    expect(waUsageLevel(1000, 1000)).toBe('over')
    expect(waUsageLevel(1500, 1000)).toBe('over')
  })
  it('нулевой лимит не роняет расчёт', () => {
    expect(waUsageLevel(10, 0)).toBe('normal')
  })
})

describe('waUsageFraction', () => {
  it('доля и потолок 1', () => {
    expect(waUsageFraction(250, 1000)).toBe(0.25)
    expect(waUsageFraction(2000, 1000)).toBe(1)
    expect(waUsageFraction(0, 1000)).toBe(0)
  })
})

describe('broadcastSentWithoutHistory', () => {
  it('считает только рассылки до начала истории -- без двойного счёта', () => {
    const before = new Date(Date.parse(BROADCAST_HISTORY_SINCE_ISO) - 1000).toISOString()
    const after = new Date(Date.parse(BROADCAST_HISTORY_SINCE_ISO) + 1000).toISOString()
    expect(broadcastSentWithoutHistory([
      { created_at: before, sent_count: 40 },
      { created_at: after, sent_count: 300 },
      { created_at: before, sent_count: null },
    ])).toBe(40)
  })
})
