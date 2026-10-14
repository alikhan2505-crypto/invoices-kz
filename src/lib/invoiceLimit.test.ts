import { describe, it, expect } from 'vitest'
import { almatyMonthStart, checkInvoiceLimit, invoicesLeft, ruPlural, isInvoiceLimitError, invoiceLimitFromError, invoiceLimitWindow, countInvoicesInWindow } from './invoiceLimit'
import { invoiceFlowDict } from './i18n/invoiceFlow'
import { getActivePlan, parseDbTimestamp } from './plan'

const DAY = 24 * 60 * 60 * 1000

describe('almatyMonthStart', () => {
  it('is local midnight of the 1st in Almaty (UTC+5), not UTC midnight', () => {
    expect(almatyMonthStart(new Date('2026-10-14T05:00:00Z')).toISOString())
      .toBe('2026-09-30T19:00:00.000Z')
  })

  it('rolls over at Almaty midnight, while it is still the previous day in UTC', () => {
    // 31 Oct 19:30 UTC = 1 Nov 00:30 in Almaty: already November there.
    expect(almatyMonthStart(new Date('2026-10-31T19:30:00Z')).toISOString())
      .toBe('2026-10-31T19:00:00.000Z')
    // One minute before Almaty midnight: still October.
    expect(almatyMonthStart(new Date('2026-10-31T18:59:00Z')).toISOString())
      .toBe('2026-09-30T19:00:00.000Z')
  })

  it('handles the year boundary', () => {
    expect(almatyMonthStart(new Date('2026-12-31T19:00:00Z')).toISOString())
      .toBe('2026-12-31T19:00:00.000Z')
    expect(almatyMonthStart(new Date('2027-01-15T12:00:00Z')).toISOString())
      .toBe('2026-12-31T19:00:00.000Z')
  })
})

describe('checkInvoiceLimit', () => {
  const free = getActivePlan({})

  it('lets a Free user create the 1st, 2nd and 3rd invoice of the month', () => {
    expect(free.isActive).toBe(false)
    expect(checkInvoiceLimit(free, 0)).toEqual({ allowed: true })
    expect(checkInvoiceLimit(free, 1)).toEqual({ allowed: true })
    expect(checkInvoiceLimit(free, 2)).toEqual({ allowed: true })
  })

  it('stops a Free user at the 4th invoice of the month', () => {
    expect(checkInvoiceLimit(free, 3)).toEqual({ allowed: false, kind: 'free', limit: 3 })
    expect(checkInvoiceLimit(free, 7)).toEqual({ allowed: false, kind: 'free', limit: 3 })
  })

  it('applies the trial limit of 10', () => {
    const trial = getActivePlan({ trial_expires_at: new Date(Date.now() + 3 * DAY).toISOString() })
    expect(checkInvoiceLimit(trial, 9)).toEqual({ allowed: true })
    expect(checkInvoiceLimit(trial, 10)).toEqual({ allowed: false, kind: 'trial', limit: 10 })
  })

  it('applies the Basic limit of 30, including bonus days', () => {
    const basic = getActivePlan({ plan: 'basic', plan_expires_at: new Date(Date.now() + 10 * DAY).toISOString() })
    expect(checkInvoiceLimit(basic, 29)).toEqual({ allowed: true })
    expect(checkInvoiceLimit(basic, 30)).toEqual({ allowed: false, kind: 'basic', limit: 30 })
    const bonus = getActivePlan({ bonus_expires_at: new Date(Date.now() + 10 * DAY).toISOString() })
    expect(checkInvoiceLimit(bonus, 30)).toEqual({ allowed: false, kind: 'basic', limit: 30 })
  })

  it('never limits Pro or an admin on a lapsed plan', () => {
    expect(checkInvoiceLimit(getActivePlan({ plan: 'pro' }), 500)).toEqual({ allowed: true })
    const lapsedAdmin = getActivePlan({ is_admin: true, plan: 'pro', plan_expires_at: new Date(Date.now() - DAY).toISOString() })
    expect(checkInvoiceLimit(lapsedAdmin, 500)).toEqual({ allowed: true })
  })

  it('treats a lapsed paid plan as Free (3)', () => {
    const lapsed = getActivePlan({ plan: 'basic', plan_expires_at: new Date(Date.now() - DAY).toISOString() })
    expect(checkInvoiceLimit(lapsed, 2)).toEqual({ allowed: true })
    expect(checkInvoiceLimit(lapsed, 3)).toEqual({ allowed: false, kind: 'free', limit: 3 })
  })
})

describe('isInvoiceLimitError', () => {
  it('recognizes the database trigger message', () => {
    expect(isInvoiceLimitError('invoice_limit_reached: 3 of 3 this month')).toBe(true)
    expect(isInvoiceLimitError('duplicate key value violates unique constraint')).toBe(false)
    expect(isInvoiceLimitError(undefined)).toBe(false)
  })
})

describe('invoiceLimitFromError', () => {
  it('takes the limit the database actually enforced, not the browser plan', () => {
    expect(invoiceLimitFromError('invoice_limit_reached: 3 of 3 this month')).toBe(3)
    expect(invoiceLimitFromError('invoice_limit_reached: 30 of 30 this month')).toBe(30)
  })

  it('returns null for anything else', () => {
    expect(invoiceLimitFromError('duplicate key value violates unique constraint')).toBeNull()
    expect(invoiceLimitFromError(null)).toBeNull()
  })
})

describe('invoicesLeft', () => {
  const free = getActivePlan({})

  it('counts down the Free quota of 3 and never goes negative', () => {
    expect(invoicesLeft(free, 0)).toBe(3)
    expect(invoicesLeft(free, 2)).toBe(1)
    expect(invoicesLeft(free, 3)).toBe(0)
    // e.g. a Basic plan lapsed mid-month with 10 invoices already made
    expect(invoicesLeft(free, 10)).toBe(0)
  })

  it('is null when there is no limit (Pro, admin)', () => {
    expect(invoicesLeft(getActivePlan({ plan: 'pro' }), 5)).toBeNull()
    expect(invoicesLeft(getActivePlan({ is_admin: true }), 5)).toBeNull()
  })
})

describe('ruPlural', () => {
  const word = (n: number) => ruPlural(n, 'счёт', 'счёта', 'счетов')
  it('picks счёт / счёта / счетов by Russian rules', () => {
    expect([0, 1, 2, 3, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 112].map(word)).toEqual([
      'счетов', 'счёт', 'счёта', 'счёта', 'счёта', 'счетов', 'счетов', 'счетов', 'счетов',
      'счёт', 'счёта', 'счетов', 'счёт', 'счетов', 'счетов',
    ])
  })
})

describe('Free plan banner text on /create', () => {
  const { ru, kk, en } = invoiceFlowDict

  it('shows the remaining quota instead of promising unlimited invoices', () => {
    expect(ru.freePlanSubtitle(3, 3)).toBe('Осталось 3 счёта из 3 в этом месяце')
    expect(ru.freePlanSubtitle(2, 3)).toBe('Осталось 2 счёта из 3 в этом месяце')
    expect(ru.freePlanSubtitle(1, 3)).toBe('Остался 1 счёт из 3 в этом месяце')
    expect(ru.freePlanSubtitle(0, 3)).toBe('Лимит на этот месяц исчерпан: 3 из 3')
    expect(kk.freePlanSubtitle(1, 3)).toBe('Осы айда 3 шоттан 1 шот қалды')
    expect(kk.freePlanSubtitle(0, 3)).toBe('Осы айдағы 3 тегін шот таусылды')
    expect(en.freePlanSubtitle(1, 3)).toBe('1 of 3 invoices left this month')
    expect(en.freePlanSubtitle(0, 3)).toBe("You've used all 3 free invoices this month")
  })

  it('stays neutral while the month count is still loading', () => {
    expect(ru.freePlanSubtitle(null, 3)).toBe('3 счёта в месяц бесплатно')
    expect(en.freePlanSubtitle(null, 3)).toBe('3 free invoices per month')
  })

  it('never mentions unlimited invoices for the Free → paid upsell', () => {
    for (const t of [ru, kk, en]) {
      const all = [t.freePlanSubtitle(2, 3), t.freePlanSubtitle(0, 3), t.freePlanSubtitle(null, 3), t.freePlanUpsell].join(' ')
      expect(all).not.toMatch(/безлимит|шексіз|unlimited/i)
    }
  })

  it('agrees the trial counters in number', () => {
    expect(ru.trialDaysLeftLabel(1, 1)).toBe('Остался 1 день · остался 1 счёт')
    expect(ru.trialDaysLeftLabel(3, 5)).toBe('Осталось 3 дня · осталось 5 счетов')
    expect(ru.daysLeftLabel(21)).toBe('Остался 21 день')
    expect(en.trialDaysLeftLabel(1, 1)).toBe('1 day left · 1 invoice left')
  })
})

describe('invoiceLimitWindow (fair windows, 14.10.2026)', () => {
  // 14 Oct 2026 10:00 in Almaty.
  const now = new Date('2026-10-14T05:00:00Z')
  const OCT_START = '2026-09-30T19:00:00.000Z' // 1 Oct 00:00 Almaty
  const iso = (w: ReturnType<typeof invoiceLimitWindow>) => w.windowStart?.toISOString() ?? null

  it('counts the trial over the trial itself, not the calendar month', () => {
    // Trial granted 28 Sep 12:00 UTC, ends 5 Oct 12:00 UTC: spans two months.
    const atOct2 = new Date('2026-10-02T06:00:00Z')
    const w = invoiceLimitWindow({ trial_expires_at: '2026-10-05T12:00:00+00:00' }, atOct2)
    expect(w).toMatchObject({ kind: 'trial', limit: 10 })
    expect(iso(w)).toBe('2026-09-28T12:00:00.000Z')
    // Same window seen from September: 10 invoices for the whole week, not 10 + 10.
    expect(iso(invoiceLimitWindow({ trial_expires_at: '2026-10-05T12:00:00+00:00' }, new Date('2026-09-29T00:00:00Z'))))
      .toBe('2026-09-28T12:00:00.000Z')
  })

  it('starts the Free window when the trial ended, so trial invoices do not eat the Free 3', () => {
    const w = invoiceLimitWindow({ trial_expires_at: '2026-10-10T08:30:00+00:00' }, now)
    expect(w).toEqual({ kind: 'free', limit: 3, windowStart: new Date('2026-10-10T08:30:00Z') })
  })

  it('uses the Almaty month start for Free when the trial ended in an earlier month', () => {
    const w = invoiceLimitWindow({ trial_expires_at: '2026-09-20T08:30:00+00:00' }, now)
    expect(iso(w)).toBe(OCT_START)
  })

  it('starts the Free window when a paid plan lapsed mid-month (timestamp without time zone = UTC)', () => {
    // PostgREST returns plan_expires_at without an offset; it is UTC, not device-local time.
    const w = invoiceLimitWindow({ plan: 'pro', plan_expires_at: '2026-10-09T23:00:00', trial_expires_at: '2026-08-01T00:00:00+00:00' }, now)
    expect(w).toEqual({ kind: 'free', limit: 3, windowStart: new Date('2026-10-09T23:00:00Z') })
  })

  it('also resets the Free window after bonus days end, and takes the latest ended period', () => {
    const w = invoiceLimitWindow({
      bonus_expires_at: '2026-10-12 04:00:00.123456',
      plan: 'basic', plan_expires_at: '2026-10-03T00:00:00',
      trial_expires_at: '2026-10-01T00:00:00+00:00',
    }, now)
    expect(w).toMatchObject({ kind: 'free', limit: 3 })
    expect(iso(w)).toBe('2026-10-12T04:00:00.123Z')
  })

  it('treats a period ending exactly now as ended (same as the DB: active means > now())', () => {
    const w = invoiceLimitWindow({ trial_expires_at: now.toISOString() }, now)
    expect(w).toEqual({ kind: 'free', limit: 3, windowStart: now })
  })

  it('keeps a brand-new Free account (no periods at all) on the calendar month', () => {
    expect(iso(invoiceLimitWindow({}, now))).toBe(OCT_START)
    expect(iso(invoiceLimitWindow(null, now))).toBe(OCT_START)
  })

  it('does not let a still-running trial be counted from an earlier month', () => {
    // Trial started 13 Oct; the September invoices of nobody matter, window = trial start.
    const w = invoiceLimitWindow({ trial_expires_at: '2026-10-20T05:00:00Z' }, now)
    expect(iso(w)).toBe('2026-10-13T05:00:00.000Z')
  })

  it('keeps Basic and bonus days on 30 per Almaty calendar month', () => {
    expect(invoiceLimitWindow({ plan: 'basic', plan_expires_at: '2026-11-01T00:00:00' }, now))
      .toEqual({ kind: 'basic', limit: 30, windowStart: new Date(OCT_START) })
    expect(invoiceLimitWindow({ bonus_expires_at: '2026-10-20T00:00:00', trial_expires_at: '2026-10-16T00:00:00Z' }, now))
      .toEqual({ kind: 'basic', limit: 30, windowStart: new Date(OCT_START) })
  })

  it('has no limit for Pro (perpetual or dated) and for admins on a lapsed plan', () => {
    const none = { kind: 'unlimited', limit: null, windowStart: null }
    expect(invoiceLimitWindow({ plan: 'pro' }, now)).toEqual(none)
    expect(invoiceLimitWindow({ plan: 'pro', plan_expires_at: '2026-11-13T00:00:00' }, now)).toEqual(none)
    expect(invoiceLimitWindow({ is_admin: true, plan: 'pro', plan_expires_at: '2026-10-01T00:00:00' }, now)).toEqual(none)
  })

  it('reads plan_expires_at as UTC even in the last hours of the plan', () => {
    // Expires 14 Oct 07:00 UTC. At 05:00 UTC the plan is still active — a
    // device-local parse in Almaty (UTC+5) would have called it lapsed at 02:00 UTC.
    expect(invoiceLimitWindow({ plan: 'basic', plan_expires_at: '2026-10-14T07:00:00' }, now).kind).toBe('basic')
    expect(getActivePlan({ plan: 'basic', plan_expires_at: '2026-10-14T07:00:00' }, now).isActive).toBe(true)
  })
})

describe('countInvoicesInWindow', () => {
  it('counts invoices from the window start on, reading created_at as UTC', () => {
    const w = invoiceLimitWindow({ trial_expires_at: '2026-10-10T08:30:00+00:00' }, new Date('2026-10-14T05:00:00Z'))
    const invoices = [
      { created_at: '2026-10-09T10:00:00' },        // trial — not counted
      { created_at: '2026-10-10T08:29:59.999999' }, // trial — not counted
      { created_at: '2026-10-10T08:30:00' },        // Free
      { created_at: '2026-10-13T20:00:00.5' },      // Free
      { created_at: null },
    ]
    expect(countInvoicesInWindow(invoices, w)).toBe(2)
    expect(countInvoicesInWindow(invoices, invoiceLimitWindow({ plan: 'pro' }))).toBe(0)
  })
})

describe('parseDbTimestamp', () => {
  it('reads offset-less Postgres timestamps as UTC and keeps explicit offsets', () => {
    expect(parseDbTimestamp('2026-11-13T00:00:00')?.toISOString()).toBe('2026-11-13T00:00:00.000Z')
    expect(parseDbTimestamp('2026-11-13 00:00:00.123456')?.toISOString()).toBe('2026-11-13T00:00:00.123Z')
    expect(parseDbTimestamp('2026-11-13T05:00:00+05:00')?.toISOString()).toBe('2026-11-13T00:00:00.000Z')
    expect(parseDbTimestamp('2026-11-13T00:00:00Z')?.toISOString()).toBe('2026-11-13T00:00:00.000Z')
    expect(parseDbTimestamp('2026-11-13')?.toISOString()).toBe('2026-11-13T00:00:00.000Z')
    expect(parseDbTimestamp(null)).toBeNull()
    expect(parseDbTimestamp('garbage')).toBeNull()
  })
})
