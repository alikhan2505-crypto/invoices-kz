import { describe, it, expect } from 'vitest'
import { buildAnalyticsSummary } from './analytics'

describe('buildAnalyticsSummary', () => {
  it('groups bookings by their Almaty-local Monday-start week', () => {
    const now = new Date()
    const r = buildAnalyticsSummary([
      { starts_at: now.toISOString(), status: 'confirmed', master_name: 'Айгерим' },
      { starts_at: now.toISOString(), status: 'confirmed', master_name: 'Айгерим' },
    ])
    expect(r.weekly).toHaveLength(1)
    expect(r.weekly[0].total).toBe(2)
    expect(r.weekly[0].cancelled).toBe(0)
  })

  it('counts cancellations per week and overall', () => {
    const now = new Date().toISOString()
    const r = buildAnalyticsSummary([
      { starts_at: now, status: 'confirmed', master_name: 'A' },
      { starts_at: now, status: 'cancelled', master_name: 'A' },
      { starts_at: now, status: 'completed', master_name: 'B' },
    ])
    expect(r.totalBookings).toBe(3)
    expect(r.cancelledBookings).toBe(1)
    expect(r.cancellationRate).toBeCloseTo(1 / 3)
    expect(r.weekly[0].cancelled).toBe(1)
  })

  it('buckets a missing/blank master_name under the "" unassigned key', () => {
    const now = new Date().toISOString()
    const r = buildAnalyticsSummary([
      { starts_at: now, status: 'confirmed', master_name: null },
      { starts_at: now, status: 'confirmed', master_name: '  ' },
    ])
    expect(r.byMaster).toHaveLength(1)
    expect(r.byMaster[0].masterName).toBe('')
    expect(r.byMaster[0].total).toBe(2)
  })

  it('ranks masters by total bookings, descending', () => {
    const now = new Date().toISOString()
    const r = buildAnalyticsSummary([
      { starts_at: now, status: 'confirmed', master_name: 'Low' },
      { starts_at: now, status: 'confirmed', master_name: 'High' },
      { starts_at: now, status: 'confirmed', master_name: 'High' },
    ])
    expect(r.byMaster.map(m => m.masterName)).toEqual(['High', 'Low'])
  })

  it('excludes bookings older than the weeksBack window', () => {
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    const r = buildAnalyticsSummary([{ starts_at: old, status: 'confirmed', master_name: 'A' }], 8)
    expect(r.totalBookings).toBe(0)
    expect(r.weekly).toHaveLength(0)
    expect(r.byMaster).toHaveLength(0)
  })

  it('returns a zero cancellation rate (not NaN) when there are no bookings', () => {
    const r = buildAnalyticsSummary([])
    expect(r.cancellationRate).toBe(0)
  })
})
