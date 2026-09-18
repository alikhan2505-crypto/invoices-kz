import { describe, it, expect } from 'vitest'
import { validateBookingInput, normalizeBookingToolInput, resolveAgainstList, promisesBooking } from './bookingDrafts'

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
