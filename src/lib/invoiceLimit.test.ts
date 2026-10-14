import { describe, it, expect } from 'vitest'
import { almatyMonthStart, checkInvoiceLimit, invoicesLeft, ruPlural, isInvoiceLimitError, invoiceLimitFromError } from './invoiceLimit'
import { invoiceFlowDict } from './i18n/invoiceFlow'
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
