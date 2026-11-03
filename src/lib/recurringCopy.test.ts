import { describe, it, expect } from 'vitest'
import { recurringCopyFields, recurringDueDate } from './recurringCopy'

const NOW = new Date('2026-11-01T09:00:00Z')

describe('recurringDueDate', () => {
  it('сохраняет отступ от даты выставления: на 14 дней - значит снова на 14 дней от сегодня', () => {
    expect(recurringDueDate('2026-10-15', '2026-10-01 10:00:00', NOW)).toBe('2026-11-15')
  })

  it('дата выставления считается по Алматы: 20:00 UTC уже следующие сутки', () => {
    // 2026-10-01 20:00 UTC = 2026-10-02 01:00 в Алматы; срок 16.10 = 14 суток
    expect(recurringDueDate('2026-10-16', '2026-10-01T20:00:00+00:00', NOW)).toBe('2026-11-15')
    // 2026-10-01 18:00 UTC = 2026-10-01 23:00 в Алматы; срок 16.10 = 15 суток
    expect(recurringDueDate('2026-10-16', '2026-10-01T18:00:00+00:00', NOW)).toBe('2026-11-16')
  })

  it('сегодня берётся по Алматы: крон в 23:30 UTC уже следующий день', () => {
    expect(recurringDueDate('2026-10-15', '2026-10-01 10:00:00', new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-15')
  })

  it('срок в тот же день - срок в день выставления копии', () => {
    expect(recurringDueDate('2026-10-01', '2026-10-01 10:00:00', NOW)).toBe('2026-11-01')
  })

  it.each([
    ['нет срока', null, '2026-10-01 10:00:00'],
    ['пустая строка', '', '2026-10-01 10:00:00'],
    ['мусор вместо даты', 'завтра', '2026-10-01 10:00:00'],
    ['срок раньше выставления', '2026-09-20', '2026-10-01 10:00:00'],
    ['срок дальше года', '2028-01-01', '2026-10-01 10:00:00'],
    ['нет даты выставления', '2026-10-15', null],
    ['дата выставления - мусор', '2026-10-15', 'вчера'],
  ])('%s - null (как у счёта без срока)', (_name, due, created) => {
    expect(recurringDueDate(due, created, NOW)).toBeNull()
  })
})

describe('recurringCopyFields', () => {
  it('переносит договор, банк, телефон и привязку клиента, флаг НДС и срок', () => {
    expect(recurringCopyFields({
      client_id: 'c1', client_phone: '+77001112233', contract_number: 'Д-5', contract_date: '2026-01-10',
      bank_id: 'b1', is_vat_payer: true, due_date: '2026-10-15', created_at: '2026-10-01 10:00:00',
    }, NOW)).toEqual({
      client_id: 'c1', client_phone: '+77001112233', contract_number: 'Д-5', contract_date: '2026-01-10',
      bank_id: 'b1', is_vat_payer: true, due_date: '2026-11-15',
    })
  })

  it('пустые значения оригинала остаются null, а не undefined (колонки обязаны попасть в insert)', () => {
    expect(recurringCopyFields({}, NOW)).toEqual({
      client_id: null, client_phone: null, contract_number: null, contract_date: null,
      bank_id: null, is_vat_payer: null, due_date: null,
    })
  })

  it('ложный is_vat_payer не превращается в null', () => {
    expect(recurringCopyFields({ is_vat_payer: false }, NOW).is_vat_payer).toBe(false)
  })
})
