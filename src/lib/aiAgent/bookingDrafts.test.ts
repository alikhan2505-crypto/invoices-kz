import { describe, it, expect } from 'vitest'
import { validateBookingInput, normalizeBookingToolInput, resolveAgainstList, promisesBooking, resolveKzDateTime } from './bookingDrafts'

// Fixed future date so date-in-the-past rejection tests stay stable
// regardless of when the suite runs.
const FUTURE_DATE = '2099-06-15'

describe('validateBookingInput', () => {
  it('accepts a valid service+date+time, resolves to a UTC instant at the fixed +05:00 offset', () => {
    const r = validateBookingInput({ service_name: ' Маникюр ', requested_date: FUTURE_DATE, requested_time: '14:30' })
    expect(r.ok).toBe(true)
    expect(r.ok && r.serviceName).toBe('Маникюр')
    expect(r.ok && r.startsAt).toBe(new Date(`${FUTURE_DATE}T14:30:00+05:00`).toISOString())
  })
  it('carries an optional master name, trimmed', () => {
    const r = validateBookingInput({ service_name: 'Маникюр', master_name: ' Айгерим ', requested_date: FUTURE_DATE, requested_time: '10:00' })
    expect(r.ok && r.masterName).toBe('Айгерим')
  })
  it('rejects a time on TODAY that has already passed, even though the date itself is not in the past (live incident 18.09.2026)', () => {
    const now = new Date()
    // An hour before "now" on today's own date -- the date is valid and
    // current, only the time-of-day is stale. Skipped near local midnight
    // to avoid a same-run flake where "an hour ago" rolls onto yesterday's
    // date, which isn't the case this test targets.
    if (now.getUTCHours() < 1) return
    const past = new Date(now.getTime() - 60 * 60 * 1000)
    const almaty = new Date(past.getTime() + 5 * 60 * 60 * 1000)
    const date = almaty.toISOString().slice(0, 10)
    const time = almaty.toISOString().slice(11, 16)
    expect(validateBookingInput({ service_name: 'Маникюр', requested_date: date, requested_time: time }).ok).toBe(false)
  })
  it('rejects: no service, bad date format, bad time format, a clearly past date', () => {
    expect(validateBookingInput({ requested_date: FUTURE_DATE, requested_time: '10:00' }).ok).toBe(false)
    expect(validateBookingInput({ service_name: 'X', requested_date: '15.06.2099', requested_time: '10:00' }).ok).toBe(false)
    expect(validateBookingInput({ service_name: 'X', requested_date: FUTURE_DATE, requested_time: '25:00' }).ok).toBe(false)
    expect(validateBookingInput({ service_name: 'X', requested_date: '2020-01-01', requested_time: '10:00' }).ok).toBe(false)
  })
})

describe('normalizeBookingToolInput', () => {
  it('prefers explicit tool values, falls back to collected conversation data', () => {
    const r = normalizeBookingToolInput({ customer_name: 'Айдос' }, { name: 'Игнор', phone: '7777' })
    expect(r.customerName).toBe('Айдос')
    expect(r.customerPhone).toBe('7777')
  })
  it('returns empty strings when nothing known (caller decides to ask)', () => {
    const r = normalizeBookingToolInput({}, {})
    expect(r.customerName).toBe('')
    expect(r.customerPhone).toBe('')
  })
  it('caps notes at 500 chars', () => {
    const r = normalizeBookingToolInput({ notes: 'x'.repeat(600) }, {})
    expect(r.notes.length).toBe(500)
  })
})

describe('resolveAgainstList', () => {
  it('substitutes the canonical spelling on a case/whitespace-insensitive match', () => {
    expect(resolveAgainstList('маникюр', ['Маникюр', 'Педикюр'])).toBe('Маникюр')
    expect(resolveAgainstList('  ПЕДИКЮР  ', ['Маникюр', 'Педикюр'])).toBe('Педикюр')
  })
  it('passes an unmatched name through unchanged rather than refusing it', () => {
    expect(resolveAgainstList('Массаж лица', ['Маникюр', 'Педикюр'])).toBe('Массаж лица')
  })
})

describe('resolveKzDateTime', () => {
  it('converts a KZ-local date+time to the matching UTC instant (fixed +05:00)', () => {
    expect(resolveKzDateTime('2026-09-25', '15:00')).toBe(new Date('2026-09-25T15:00:00+05:00').toISOString())
  })
  it('does NOT reject a past date/time -- manual entries have no such guard, unlike validateBookingInput', () => {
    expect(resolveKzDateTime('2020-01-01', '10:00')).toBe(new Date('2020-01-01T10:00:00+05:00').toISOString())
  })
  it('returns null on a malformed date or time', () => {
    expect(resolveKzDateTime('25.09.2026', '15:00')).toBeNull()
    expect(resolveKzDateTime('2026-09-25', '25:00')).toBeNull()
  })
})

describe('promisesBooking', () => {
  it('flags a first-person past/present/future commitment with no question attached', () => {
    expect(promisesBooking('Записала вас на пятницу в 15:00.')).toBe(true)
    expect(promisesBooking('Бронирую время на маникюр.')).toBe(true)
    expect(promisesBooking('Хорошо, я вас запишу.')).toBe(true)
  })
  it('does not flag a question or conditional phrasing, even with a commit verb present', () => {
    expect(promisesBooking('На какое время вас записать?')).toBe(false)
    expect(promisesBooking('Если хотите, я запишу вас на удобное время.')).toBe(false)
  })
  it('does not flag unrelated text', () => {
    expect(promisesBooking('Маникюр стоит 8000 тенге.')).toBe(false)
  })
})
