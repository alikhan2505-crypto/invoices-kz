import { describe, expect, it } from 'vitest'
import { KAZAKHSTAN_BANKS } from '@/lib/kazakhstanBanks'
import { binControlDigit, ibanMod97, validateBinIin, validateIik } from '@/lib/kzIdentifiers'
import { hasToolOffer, planToolRequisites, saveToolRequisites, type SaveClient } from './saveToolRequisites'

// БИН и ИИК с верными контрольными разрядами, посчитанными теми же функциями, что проверяет кабинет.
const GOOD_BIN = '05014000816' + String(binControlDigit('05014000816'))
const GOOD_IIK = (() => {
  const bban = '125KZT1001300304'
  const check = String(98 - ibanMod97('KZ00' + bban)).padStart(2, '0')
  return `KZ${check}${bban}`
})()
const bank = KAZAKHSTAN_BANKS[0]
const REQ = {
  companyName: 'ТОО Ромашка', binIin: GOOD_BIN, address: 'Астана', director: 'Иванов И.', email: 'a@b.kz', phone: '+77001234567',
  bankBik: bank.bik, iik: GOOD_IIK,
}

interface Call { table: string; op: string; payload?: unknown; id?: string }
function fakeClient(opts: { profileRows?: number; profileError?: boolean; bankError?: boolean } = {}) {
  const calls: Call[] = []
  const client: SaveClient = {
    from: (table: string) => ({
      update: (payload: unknown) => ({
        eq: (_c: string, id: string) => ({
          select: async () => {
            calls.push({ table, op: 'update', payload, id })
            return opts.profileError ? { data: null, error: { message: 'x' } } : { data: Array.from({ length: opts.profileRows ?? 1 }, () => ({ id })), error: null }
          },
        }),
      }),
      insert: async (payload: unknown) => {
        calls.push({ table, op: 'insert', payload })
        return { error: opts.bankError ? { message: 'x' } : null }
      },
    }),
  }
  return { client, calls }
}

describe('test fixtures', () => {
  it('are valid for the cabinet checks', () => {
    expect(validateBinIin(GOOD_BIN)).toBeNull()
    expect(validateIik(GOOD_IIK)).toBeNull()
  })
})

describe('planToolRequisites / hasToolOffer', () => {
  it('offers both profile and bank to an empty account', () => {
    const plan = planToolRequisites({}, 0, REQ)
    expect(plan.needProfile && plan.needBank).toBe(true)
    expect(plan.profileFill).toMatchObject({ company_name: 'ТОО Ромашка', bin_iin: GOOD_BIN })
    expect(plan.bank?.iik).toBe(GOOD_IIK)
    expect(hasToolOffer(plan, {})).toBe(true)
  })

  it('offers only the bank when the profile is already complete', () => {
    const profile = { company_name: 'ИП Свой', bin_iin: '123456789012' }
    const plan = planToolRequisites(profile, 0, REQ)
    expect(plan.needProfile).toBe(false)
    expect(plan.profileFill).toEqual({})
    expect(hasToolOffer(plan, profile)).toBe(true)
  })

  it('offers nothing when the account has everything or the browser has nothing', () => {
    const profile = { company_name: 'ИП Свой', bin_iin: '123456789012' }
    expect(hasToolOffer(planToolRequisites(profile, 1, REQ), profile)).toBe(false)
    expect(hasToolOffer(planToolRequisites({}, 0, {}), {})).toBe(false)
  })

  it('does not offer a profile without company name or БИН in the saved data', () => {
    expect(hasToolOffer(planToolRequisites({}, 1, { address: 'Астана' }), {})).toBe(false)
  })
})

describe('saveToolRequisites', () => {
  it('writes the profile first, then the bank as the main account with the kbe of the company type', async () => {
    const { client, calls } = fakeClient()
    const r = await saveToolRequisites(client, 'u1', {}, 0, REQ)
    expect(r).toEqual({ ok: true, savedProfile: true, savedBank: true })
    expect(calls.map(c => `${c.table}:${c.op}`)).toEqual(['profiles:update', 'bank_accounts:insert'])
    expect(calls[0].id).toBe('u1')
    expect(calls[1].payload).toMatchObject({ user_id: 'u1', bank_name: bank.name, bik: bank.bik, iik: GOOD_IIK, kbe: '17', currency: 'KZT', is_main: true })
  })

  it('uses the saved kbe when it was edited by hand, and kbe 19 for an ИП', async () => {
    const a = fakeClient()
    await saveToolRequisites(a.client, 'u', {}, 0, { ...REQ, kbe: '14' })
    expect(a.calls[1].payload).toMatchObject({ kbe: '14' })
    const b = fakeClient()
    await saveToolRequisites(b.client, 'u', {}, 0, { ...REQ, companyName: 'ИП Петров' })
    expect(b.calls[1].payload).toMatchObject({ kbe: '19' })
  })

  it('does not touch a filled profile and adds only the bank', async () => {
    const { client, calls } = fakeClient()
    const r = await saveToolRequisites(client, 'u', { company_name: 'ИП Свой', bin_iin: '123456789012' }, 0, REQ)
    expect(r).toEqual({ ok: true, savedProfile: false, savedBank: true })
    expect(calls.map(c => c.table)).toEqual(['bank_accounts'])
  })

  it('refuses a БИН or ИИК that fails the check digit and writes nothing', async () => {
    const a = fakeClient()
    expect(await saveToolRequisites(a.client, 'u', {}, 0, { ...REQ, binIin: '123456789012' })).toEqual({ ok: false, reason: 'bin' })
    expect(a.calls).toEqual([])
    const b = fakeClient()
    expect(await saveToolRequisites(b.client, 'u', {}, 0, { ...REQ, iik: 'KZ00000000000000000000' })).toEqual({ ok: false, reason: 'iik' })
    expect(b.calls).toEqual([])
  })

  it('does not add the bank when the profile write failed', async () => {
    const { client, calls } = fakeClient({ profileRows: 0 })
    expect(await saveToolRequisites(client, 'u', {}, 0, REQ)).toEqual({ ok: false, reason: 'profile' })
    expect(calls.map(c => c.table)).toEqual(['profiles'])
    const e = fakeClient({ profileError: true })
    expect(await saveToolRequisites(e.client, 'u', {}, 0, REQ)).toEqual({ ok: false, reason: 'profile' })
  })

  it('reports a bank write failure and nothing to save', async () => {
    expect(await saveToolRequisites(fakeClient({ bankError: true }).client, 'u', {}, 0, REQ)).toEqual({ ok: false, reason: 'bank' })
    expect(await saveToolRequisites(fakeClient().client, 'u', { company_name: 'x', bin_iin: '1' }, 1, REQ)).toEqual({ ok: false, reason: 'nothing' })
  })
})
