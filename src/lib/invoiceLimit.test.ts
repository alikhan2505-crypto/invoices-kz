import { describe, it, expect } from 'vitest'
import { almatyMonthStart, checkInvoiceLimit, isInvoiceLimitError, invoiceLimitFromError } from './invoiceLimit'
import { getActivePlan } from './plan'

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
