import { describe, expect, it } from 'vitest'
import { almatyDay, almatyDaysBetween, formatAlmatyDay, formatAlmatyTime } from './almatyDay'
import { buildCarReportText, coldStartCaveat, LIKELY_CAVEAT, ruPlural, type CarReportData } from './report'

describe('almatyDay (UTC+5, no DST)', () => {
  it('20:00 Almaty = 15:00 UTC is still the same Almaty day', () => {
    const d = almatyDay(new Date('2026-10-16T15:00:00Z'))
    expect(d).toEqual({ day: '2026-10-16', startIso: '2026-10-15T19:00:00.000Z', endIso: '2026-10-16T19:00:00.000Z' })
  })

  it('19:00 UTC is already the next Almaty day; 18:59:59 is not', () => {
    expect(almatyDay(new Date('2026-10-16T19:00:00Z')).day).toBe('2026-10-17')
    expect(almatyDay(new Date('2026-10-16T18:59:59.999Z')).day).toBe('2026-10-16')
  })

  it('early UTC morning of the same date is the same Almaty date', () => {
    expect(almatyDay(new Date('2026-10-16T00:30:00Z')).day).toBe('2026-10-16')
  })

  it('offsets: yesterday and 6 days back, across a month boundary', () => {
    const now = new Date('2026-11-01T10:00:00Z')
    expect(almatyDay(now, -1)).toEqual({ day: '2026-10-31', startIso: '2026-10-30T19:00:00.000Z', endIso: '2026-10-31T19:00:00.000Z' })
    expect(almatyDay(now, -6).day).toBe('2026-10-26')
  })

  it('formatAlmatyTime: actual run time in Almaty (Hobby cron fires anywhere in the hour)', () => {
    expect(formatAlmatyTime(new Date('2026-10-16T15:00:00Z'))).toBe('20:00')
    expect(formatAlmatyTime(new Date('2026-10-16T15:37:12Z'))).toBe('20:37')
    expect(formatAlmatyTime(new Date('2026-10-16T19:05:00Z'))).toBe('00:05')
  })

  it('almatyDaysBetween', () => {
    expect(almatyDaysBetween('2026-10-16', '2026-10-16')).toBe(0)
    expect(almatyDaysBetween('2026-10-16', '2026-10-23')).toBe(7)
    expect(almatyDaysBetween('2026-10-30', '2026-11-02')).toBe(3)
  })

  it('formatAlmatyDay', () => {
    expect(formatAlmatyDay('2026-10-16')).toBe('16.10 (пт)')
    expect(formatAlmatyDay('2026-10-18')).toBe('18.10 (вс)')
  })
})

describe('ruPlural', () => {
  it('handles 1/2-4/5+/11-14', () => {
    const w = (n: number) => ruPlural(n, 'заход', 'захода', 'заходов')
    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(w)).toEqual([
      'заходов', 'заход', 'захода', 'захода', 'заходов', 'заходов', 'заходов', 'заходов', 'заход', 'захода', 'заходов', 'заход', 'заходов',
    ])
  })
})

const data: CarReportData = {
  day: '2026-10-16',
  asOf: '20:37',
  trackingSince: '2026-10-01',
  tablesMissing: false,
  today: { visits: 84, newVisitors: 61, carExact: 1, carLikely: 4, carSignups: 1, signups: 3 },
  yesterday: { visits: 70, newVisitors: 52, carExact: 0, carLikely: 3, carSignups: 0, signups: 2 },
  week: { carVisits: 12, carSignups: 1, signups: 15 },
}

describe('buildCarReportText', () => {
  it('renders the full report', () => {
    expect(buildCarReportText(data)).toBe([
      'INVOICES.KZ — машина/QR, 16.10 (пт), на 20:37',
      '',
      'Машина/QR: 5 заходов (точно по QR: 1, вероятно: 4), регистраций от них: 1',
      'Вчера за весь день: 3 (точно 0, вероятно 3), регистраций 0',
      'За 7 дней: 12 заходов, регистраций 1',
      '',
      'Весь сайт сегодня: 84 захода, новых посетителей 61 (вчера за весь день 70 и 52)',
      'Регистраций сегодня: 3 (вчера за весь день 2, за 7 дней 15)',
      '',
      LIKELY_CAVEAT,
    ].join('\n'))
  })

  it('shows н/д for a failed metric instead of 0', () => {
    const text = buildCarReportText({ ...data, today: { ...data.today, carLikely: null } })
    expect(text).toContain('Машина/QR: н/д заходов (точно по QR: 1, вероятно: н/д)')
  })

  it('uses singular for one visit', () => {
    const text = buildCarReportText({ ...data, today: { ...data.today, carExact: 1, carLikely: 0 } })
    expect(text).toContain('Машина/QR: 1 заход (')
  })

  it('says the tables are not created yet before the migration', () => {
    const text = buildCarReportText({ ...data, tablesMissing: true })
    expect(text).toContain('таблицы site_visits и signup_sources не созданы')
    expect(text).toContain('supabase/migrations/site_visits.sql')
    expect(text).toContain('Регистраций сегодня: 3 (вчера за весь день 2)')
    expect(text).not.toContain('Машина/QR:')
  })

  it('warns that new/likely are overstated during the first week of tracking only', () => {
    const first = buildCarReportText({ ...data, trackingSince: '2026-10-16' })
    expect(first).toContain(coldStartCaveat('2026-10-16'))
    expect(first).toContain('Счётчик работает с 16.10')
    expect(buildCarReportText({ ...data, trackingSince: '2026-10-10' })).toContain('Счётчик работает с 10.10')
    expect(buildCarReportText({ ...data, trackingSince: '2026-10-09' })).not.toContain('Счётчик работает')
    expect(buildCarReportText({ ...data, trackingSince: null })).not.toContain('Счётчик работает')
  })

  it('is plain text (no HTML that a transport could choke on)', () => {
    expect(buildCarReportText(data)).not.toMatch(/[<>]/)
  })
})
