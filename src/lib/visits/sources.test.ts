import { describe, expect, it } from 'vitest'
import { aggregateTraffic, type SignupSourceDbRow, type VisitDbRow } from './sources'

// 17.10.2026 12:00 по Алматы = 07:00 UTC.
const NOW = Date.parse('2026-10-17T07:00:00Z')
// Окно 7 дней начинается 11.10 00:00 Алматы = 10.10 19:00 UTC; 30 дней — 18.09 00:00 Алматы.
const TODAY = '2026-10-17T05:00:00Z'
const TEN_DAYS = '2026-10-07T05:00:00Z'
const OLD = '2026-09-17T18:59:00Z' // за минуту до начала 30-дневного окна

const v = (source_class: string, utm_source: string | null = null, utm_campaign: string | null = null, created_at = TODAY): VisitDbRow =>
  ({ created_at, source_class, utm_source, utm_campaign })
const s = (source_class: string, created_at = TODAY): SignupSourceDbRow => ({ created_at, source_class })
const cls = (t: ReturnType<typeof aggregateTraffic>, c: string) => t.classes.find(x => x.cls === c)!

describe('aggregateTraffic', () => {
  it('counts visits per class in the 7- and 30-day windows (a 7-day row is also in 30)', () => {
    const t = aggregateTraffic([v('social'), v('social'), v('social', null, null, TEN_DAYS), v('search')], [], NOW)
    expect(cls(t, 'social').visits).toEqual([2, 3])
    expect(cls(t, 'search').visits).toEqual([1, 1])
    expect(cls(t, 'direct_other').visits).toEqual([0, 0])
    expect(t.totals.visits).toEqual([3, 4])
  })

  it('drops rows older than 30 days and rows from the future', () => {
    const t = aggregateTraffic([v('social', null, null, OLD), v('social', null, null, '2026-10-30T00:00:00Z')], [s('social', OLD)], NOW)
    expect(t.totals.visits).toEqual([0, 0])
    expect(t.totals.signups).toEqual([0, 0])
  })

  it('groups by utm_source/utm_campaign, normalising case, and counts the rest as no-utm', () => {
    const t = aggregateTraffic([
      v('social', 'tg_chat', 'waybills_oct'), v('social', 'TG_chat', 'waybills_oct'),
      v('referral', 'sellers_kz', 'waybills_oct', TEN_DAYS),
      v('referral', null, 'margin_oct'),
      v('direct_other'), v('search'),
    ], [], NOW)
    expect(t.utm).toEqual([
      { source: 'tg_chat', campaign: 'waybills_oct', visits: [2, 2] },
      // при равных 30 днях выше тот, у кого больше за 7
      { source: null, campaign: 'margin_oct', visits: [1, 1] },
      { source: 'sellers_kz', campaign: 'waybills_oct', visits: [0, 1] },
    ])
    expect(t.totals.noUtmVisits).toEqual([2, 2])
    expect(t.totals.visits).toEqual([5, 6])
  })

  it('counts signups by class; an unexpected class falls into unknown so the sum holds', () => {
    const t = aggregateTraffic([], [s('car_exact'), s('social'), s('social', TEN_DAYS), s('whatever'), s('unknown')], NOW)
    expect(cls(t, 'social').signups).toEqual([1, 2])
    expect(cls(t, 'car_exact').signups).toEqual([1, 1])
    expect(cls(t, 'unknown').signups).toEqual([2, 2])
    expect(t.totals.signups).toEqual([4, 5])
    expect(t.classes.reduce((n, c) => n + c.signups[1], 0)).toBe(5)
  })

  it('lists every class even with no data, and ignores garbage timestamps', () => {
    const t = aggregateTraffic([v('social', null, null, 'not a date')], [], NOW)
    expect(t.classes.map(c => c.cls)).toEqual(['car_exact', 'car_likely', 'search', 'social', 'direct_other', 'referral', 'unknown'])
    expect(t.totals.visits).toEqual([0, 0])
    expect(t.utm).toEqual([])
  })
})
