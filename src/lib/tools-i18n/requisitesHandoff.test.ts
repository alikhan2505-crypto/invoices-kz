import { describe, expect, it } from 'vitest'
import { KAZAKHSTAN_BANKS, OTHER_BANK } from '@/lib/kazakhstanBanks'
import { bankFromToolRequisites, fillProfileFromToolRequisites, type OwnProfileFields } from './requisitesHandoff'

const EMPTY: OwnProfileFields = { company_name: '', bin_iin: '', address: '', email: '', phone: '', director_name: '', accountant_name: '' }
const bank = KAZAKHSTAN_BANKS[0]

describe('fillProfileFromToolRequisites', () => {
  it('fills every empty field from the saved tool requisites', () => {
    const r = fillProfileFromToolRequisites(EMPTY, {
      companyName: 'ТОО Ромашка', binIin: '123 456 789 012', address: 'Астана', director: 'Иванов И.И.', email: 'a@b.kz', phone: '+77001234567',
    })
    expect(r.filled).toBe(6)
    expect(r.next).toMatchObject({ company_name: 'ТОО Ромашка', bin_iin: '123456789012', address: 'Астана', director_name: 'Иванов И.И.', email: 'a@b.kz', phone: '+77001234567' })
  })

  it('never overwrites what the profile already holds', () => {
    const cur = { ...EMPTY, company_name: 'ИП Свой', bin_iin: '999999999999' }
    const r = fillProfileFromToolRequisites(cur, { companyName: 'ТОО Чужое', binIin: '123456789012', address: 'Алматы' })
    expect(r.next.company_name).toBe('ИП Свой')
    expect(r.next.bin_iin).toBe('999999999999')
    expect(r.next.address).toBe('Алматы')
    expect(r.filled).toBe(1)
  })

  it('treats whitespace-only fields as empty and skips a БИН that is not 12 digits', () => {
    const r = fillProfileFromToolRequisites({ ...EMPTY, address: '   ' }, { address: 'Астана', binIin: '12345' })
    expect(r.next.address).toBe('Астана')
    expect(r.next.bin_iin).toBe('')
    expect(r.filled).toBe(1)
  })

  it('reports nothing filled for empty requisites', () => {
    const r = fillProfileFromToolRequisites(EMPTY, {})
    expect(r.filled).toBe(0)
    expect(r.next).toEqual(EMPTY)
  })
})

describe('bankFromToolRequisites', () => {
  it('builds the account from a listed bank, taking the name from the registry', () => {
    const b = bankFromToolRequisites({ bankBik: bank.bik, iik: 'kz12 3456 7890 1234 5678' })
    expect(b).toEqual({ bank_name: bank.name, bik: bank.bik, iik: 'KZ123456789012345678', kbe: '' })
  })

  it('uses the other-bank fields when the picker holds the OTHER_BANK sentinel', () => {
    const b = bankFromToolRequisites({ bankBik: OTHER_BANK, otherBankName: 'Мой банк', otherBankBik: 'abcdkzkx', iik: 'KZ00', kbe: '17' })
    expect(b).toEqual({ bank_name: 'Мой банк', bik: 'ABCDKZKX', iik: 'KZ00', kbe: '17' })
  })

  it('returns null when the iik, the bik or the bank name is missing', () => {
    expect(bankFromToolRequisites({ bankBik: bank.bik })).toBeNull()
    expect(bankFromToolRequisites({ iik: 'KZ00' })).toBeNull()
    expect(bankFromToolRequisites({ bankBik: OTHER_BANK, otherBankBik: 'ABCDKZKX', iik: 'KZ00' })).toBeNull()
    expect(bankFromToolRequisites({})).toBeNull()
  })
})
