import { describe, expect, it } from 'vitest'
import { aggregateToolFunnel, almatyDay, parsePeriod, pct, periodStart, type ToolEventDbRow } from './funnel'

// 15.10.2026 12:00 по Алматы = 07:00 UTC.
const NOW = Date.parse('2026-10-15T07:00:00Z')
const AT = '2026-10-15T06:00:00Z'

function ev(event: string, tool: string, visitor: string | null, extra: Partial<ToolEventDbRow> = {}): ToolEventDbRow {
  return { created_at: AT, event, tool, visitor, user_id: null, internal: false, medium: null, ...extra }
}

const run = (rows: ToolEventDbRow[], opts: { days?: number; includeInternal?: boolean; selfVisitors?: string[] } = {}) =>
  aggregateToolFunnel(rows, { days: opts.days ?? 7, includeInternal: opts.includeInternal ?? false, now: NOW, selfVisitors: opts.selfVisitors })

const tool = (f: ReturnType<typeof run>, name: string) => f.tools.find(t => t.tool === name)!

describe('time helpers', () => {
  it('buckets days in Almaty time (UTC+5)', () => {
    expect(almatyDay('2026-10-14T18:59:00Z')).toBe('2026-10-14')
    expect(almatyDay('2026-10-14T19:00:00Z')).toBe('2026-10-15')
  })
  it('starts the period at Almaty midnight, days-1 days ago', () => {
    expect(new Date(periodStart(1, NOW)).toISOString()).toBe('2026-10-14T19:00:00.000Z')
    expect(new Date(periodStart(7, NOW)).toISOString()).toBe('2026-10-08T19:00:00.000Z')
  })
  it('parses only 7/30/90, defaulting to 30', () => {
    expect(parsePeriod('7')).toBe(7)
    expect(parsePeriod('90')).toBe(90)
    expect(parsePeriod('365')).toBe(30)
    expect(parsePeriod(null)).toBe(30)
  })
  it('pct handles zero division and rounds to 0.1', () => {
    expect(pct(1, 0)).toBeNull()
    expect(pct(0, 5)).toBe(0)
    expect(pct(1, 3)).toBe(33.3)
    expect(pct(2, 3)).toBe(66.7)
  })
})

describe('aggregateToolFunnel', () => {
  it('counts distinct visitors per tool and once in totals', () => {
    const f = run([
      ev('view', 'kp', 'v1'), ev('view', 'kp', 'v1'), ev('view', 'kp', 'v2'),
      ev('view', 'schet', 'v1'),
    ])
    expect(tool(f, 'kp')).toMatchObject({ visitors: 2, views: 3 })
    expect(tool(f, 'schet')).toMatchObject({ visitors: 1, views: 1 })
    expect(f.totals).toMatchObject({ visitors: 2, views: 4 })
  })

  it('ignores login steps and watch clicks (read by SQL, not part of the funnel)', () => {
    const f = run([
      ev('view', 'kontragent', 'v1'),
      ev('login_open', 'none', 'v1'), ev('login_link_sent', 'none', 'v1'),
      ev('tool_watch_click', 'kontragent', 'v1'), ev('tool_form_more_open', 'kp', 'v1'),
    ])
    expect(f.rowsConsidered).toBe(1)
    expect(f.totals).toMatchObject({ visitors: 1, views: 1, cta: 0 })
    expect(f.unattributedSignups).toBe(0)
  })

  it('collects the login block: distinct people per step and per source, internal excluded', () => {
    const src = (s: string) => ({ utm_source: s })
    const f = run([
      ev('login_open', 'none', 'v1', src('tools')), ev('login_open', 'none', 'v1', src('tools')), ev('login_open', 'none', 'v2', src('dm')),
      ev('login_email_press', 'none', 'v1', src('tools')), ev('login_link_sent', 'none', 'v1', src('tools')),
      ev('login_google', 'none', 'v2', src('dm')), ev('login_captcha_missing', 'none', 'v3'),
      ev('tool_watch_click', 'kontragent', 'v1', src('tools')),
      ev('login_open', 'none', 'v9', { internal: true }),
    ])
    const step = (e: string) => f.login.steps.find(x => x.event === e)!
    expect(step('login_open')).toMatchObject({ events: 3, visitors: 2 })
    expect(step('login_email_press')).toMatchObject({ events: 1, visitors: 1 })
    expect(step('login_captcha_missing')).toMatchObject({ events: 1, visitors: 1 })
    expect(step('tool_watch_click')).toMatchObject({ events: 1, visitors: 1 })
    expect(f.login.bySource.find(r => r.source === 'tools')).toMatchObject({ open: 1, press: 1, sent: 1, google: 0 })
    expect(f.login.bySource.find(r => r.source === 'dm')).toMatchObject({ open: 1, press: 0, sent: 0, google: 1 })
    // в общую воронку эти события не входят
    expect(f.rowsConsidered).toBe(0)
  })

  it('treats each view without a visitor id as its own visitor', () => {
    const f = run([ev('view', 'kp', null), ev('view', 'kp', null)])
    expect(tool(f, 'kp').visitors).toBe(2)
  })

  it('computes docs/cta/signup percentages from distinct visitors', () => {
    const f = run([
      ev('view', 'kp', 'v1'), ev('view', 'kp', 'v2'), ev('view', 'kp', 'v3'), ev('view', 'kp', 'v4'),
      ev('doc', 'kp', 'v1'), ev('doc', 'kp', 'v1'), ev('doc', 'kp', 'v2'),
      ev('cta', 'kp', 'v1', { medium: 'cta' }), ev('cta', 'kp', 'v1', { medium: 'limit' }),
      ev('limit', 'kp', 'v1'), ev('lead', 'kp', 'v2'),
      ev('signup', 'kp', 'v1', { user_id: 'u1' }),
    ])
    expect(tool(f, 'kp')).toMatchObject({
      visitors: 4, docs: 3, docVisitors: 2, docsPct: 50,
      cta: 2, ctaVisitors: 1, ctaPct: 25,
      limits: 1, leads: 1, signups: 1, signupsPct: 25,
    })
    expect(tool(f, 'kp').ctaByMedium).toMatchObject({ cta: 1, limit: 1, product: 0, other: 0 })
  })

  it('returns null percentages for a tool with no visitors', () => {
    const f = run([ev('doc', 'nalogi', 'v1')])
    expect(tool(f, 'nalogi')).toMatchObject({ visitors: 0, docs: 1, docsPct: null, ctaPct: null, signupsPct: null })
    expect(tool(f, 'margin')).toMatchObject({ visitors: 0, docs: 0, docsPct: null })
  })

  it('attributes signups to the first-touch tool, once per account', () => {
    const f = run([
      ev('view', 'margin', 'v1'),
      ev('signup', 'margin', 'v1', { user_id: 'u1' }),
      ev('signup', 'margin', 'v1', { user_id: 'u1' }),
      ev('signup', 'none', 'v9', { user_id: 'u2' }),
      ev('signup', 'none', null, { user_id: 'u3' }),
    ])
    expect(tool(f, 'margin')).toMatchObject({ signups: 1, signupsPct: 100 })
    expect(f.totals.signups).toBe(1)
    expect(f.unattributedSignups).toBe(2)
    expect(f.series.at(-1)).toMatchObject({ day: '2026-10-15', signups: 3 })
  })

  it('hides internal rows and every event of a visitor flagged internal, unless asked', () => {
    const rows = [
      ev('view', 'kp', 'founder'), // before /admin set the flag
      ev('doc', 'kp', 'founder', { internal: true }),
      ev('view', 'kp', null, { internal: true }), // bot without id
      ev('view', 'kp', 'real'),
    ]
    const hidden = run(rows)
    expect(tool(hidden, 'kp')).toMatchObject({ visitors: 1, views: 1, docs: 0 })
    expect(hidden.rowsConsidered).toBe(1)

    const shown = run(rows, { includeInternal: true })
    expect(tool(shown, 'kp')).toMatchObject({ visitors: 3, views: 3, docs: 1 })
    expect(shown.includeInternal).toBe(true)
  })

  it('does not let id-less docs/clicks push percentages over 100%', () => {
    const f = run([
      ev('view', 'kp', null),
      ev('doc', 'kp', null), ev('doc', 'kp', null),
      ev('cta', 'kp', null, { medium: 'cta' }), ev('cta', 'kp', null, { medium: 'cta' }),
    ])
    expect(tool(f, 'kp')).toMatchObject({ visitors: 1, docs: 2, docVisitors: 0, cta: 2, ctaVisitors: 0 })
    expect(tool(f, 'kp').docsPct).toBeLessThanOrEqual(100)
    expect(tool(f, 'kp').ctaPct).toBeLessThanOrEqual(100)
  })

  it('caps doc/cta percentages at 100 when the view fell before the period', () => {
    const f = run([
      ev('view', 'kp', 'a'),
      ev('doc', 'kp', 'a'), ev('doc', 'kp', 'b'), // b viewed before the period
    ])
    expect(tool(f, 'kp').docsPct).toBe(100)
  })

  it('hides the requesting admin browser (selfVisitors) even without an internal row', () => {
    const rows = [ev('view', 'kp', 'founder'), ev('doc', 'kp', 'founder'), ev('view', 'kp', 'real')]
    expect(tool(run(rows, { selfVisitors: ['founder'] }), 'kp')).toMatchObject({ visitors: 1, docs: 0 })
    expect(tool(run(rows, { selfVisitors: ['founder'], includeInternal: true }), 'kp')).toMatchObject({ visitors: 2, docs: 1 })
  })

  it('ignores rows before the period and unknown tools', () => {
    const f = run([
      ev('view', 'kp', 'old', { created_at: '2026-10-08T18:59:59Z' }),
      ev('view', 'kp', 'edge', { created_at: '2026-10-08T19:00:00Z' }),
      ev('view', 'invoices', 'v1'),
    ])
    expect(tool(f, 'kp').visitors).toBe(1)
    expect(f.totals.visitors).toBe(1)
  })

  it('builds a per-day series covering the whole period in Almaty days', () => {
    const f = run([
      ev('view', 'kp', 'v1', { created_at: '2026-10-14T18:30:00Z' }), // 14.10 23:30 Алматы
      ev('view', 'kp', 'v1', { created_at: '2026-10-14T19:30:00Z' }), // 15.10 00:30 Алматы
      ev('view', 'schet', 'v1', { created_at: '2026-10-14T20:00:00Z' }),
      ev('doc', 'kp', 'v1', { created_at: '2026-10-14T20:00:00Z' }),
    ])
    expect(f.series).toHaveLength(7)
    expect(f.series[0].day).toBe('2026-10-09')
    expect(f.series.at(-1)).toEqual({ day: '2026-10-15', visitors: 1, docs: 1, signups: 0 })
    expect(f.series.at(-2)).toEqual({ day: '2026-10-14', visitors: 1, docs: 0, signups: 0 })

    expect(run([], { days: 30 }).series).toHaveLength(30)
    expect(run([], { days: 90 }).series).toHaveLength(90)
  })

  it('returns every tool row even with no data', () => {
    const f = run([])
    expect(f.tools.map(t => t.tool)).toEqual(['kp', 'schet', 'avr', 'nakladnaya', 'kontragent', 'nalogi', 'margin', 'waybills', 'zarplata'])
    expect(f.totals).toMatchObject({ visitors: 0, docs: 0, signups: 0, docsPct: null })
  })
})

describe('aggregateToolFunnel: разрез по меткам', () => {
  const utm = (source: string | null, campaign: string | null, medium: string | null = null) => ({ utm_source: source, utm_medium: medium, utm_campaign: campaign })
  const row = (f: ReturnType<typeof run>, source: string | null, campaign: string | null) =>
    f.sources.find(r => r.source === source && r.campaign === campaign)!

  it('groups visitors, docs, clicks, limits, leads and signups by source/medium/campaign', () => {
    const tg = utm('tg_chat', 'waybills_oct', 'chat_post')
    const f = run([
      ev('view', 'waybills', 'a', tg), ev('view', 'waybills', 'b', tg), ev('view', 'margin', 'a', tg),
      ev('doc', 'waybills', 'a', tg), ev('cta', 'waybills', 'a', { ...tg, medium: 'cta' }),
      ev('limit', 'waybills', 'b', tg), ev('lead', 'waybills', 'b', tg),
      ev('signup', 'waybills', 'a', { ...tg, user_id: 'u1' }),
      ev('view', 'kp', 'c', utm('sellers_kz', 'waybills_oct', 'paid_post')),
      ev('view', 'kp', 'd'),
    ])
    expect(f.sources).toHaveLength(3)
    expect(row(f, 'tg_chat', 'waybills_oct')).toMatchObject({
      medium: 'chat_post', visitors: 2, views: 3, docs: 1, cta: 1, limits: 1, leads: 1, signups: 1,
    })
    expect(row(f, 'sellers_kz', 'waybills_oct')).toMatchObject({ medium: 'paid_post', visitors: 1, docs: 0 })
  })

  it('merges case/space variants and puts the unlabelled row last', () => {
    const f = run([
      ev('view', 'kp', 'a'), ev('view', 'kp', 'b'), ev('view', 'kp', 'c'),
      ev('view', 'kp', 'd', utm('TG_chat ', 'X')), ev('view', 'kp', 'e', utm('tg_chat', 'x')),
    ])
    expect(f.sources.map(r => [r.source, r.campaign, r.visitors])).toEqual([['tg_chat', 'x', 2], [null, null, 3]])
  })

  it('keeps source rows consistent with the totals and respects the internal filter', () => {
    const rows = [
      ev('view', 'kp', 'a', utm('ig', 'm')), ev('view', 'kp', 'b', utm('ig', 'm')),
      ev('view', 'kp', 'me', { ...utm('ig', 'm'), internal: true }),
    ]
    const f = run(rows)
    expect(row(f, 'ig', 'm').visitors).toBe(2)
    expect(f.sources.reduce((n, r) => n + r.visitors, 0)).toBe(f.totals.visitors)
    expect(row(run(rows, { includeInternal: true }), 'ig', 'm').visitors).toBe(3)
  })

  it('does not count unattributed (tool=none) signups in any source row', () => {
    const f = run([ev('signup', 'none', 'v9', { user_id: 'u2' })])
    expect(f.sources).toEqual([])
    expect(f.unattributedSignups).toBe(1)
  })
})
