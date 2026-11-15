import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CLAIM_TTL_MS, MAX_ATTEMPTS, hashClaimCode, isDisposableAccount, startEmailClaim, verifyEmailClaim } from './service'
import { makeFakeAdmin, makeLoginDb } from '@/lib/whatsappLogin/fakeLoginDb.testkit'

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0)
const REDIRECT = 'https://invoices.kz/auth/callback'
const ME = 'user-1'
const OTHER = 'user-other'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

function setup(opts: { owners?: Record<string, string>; tables?: Record<string, any[]> } = {}) {
  const tables: Record<string, any[]> = { profiles: [{ id: ME, email: null, company_name: null, bin_iin: null }, { id: OTHER, email: 'real@mail.kz' }], whatsapp_identities: [{ wa_id: '77001112233', user_id: ME }], ...opts.tables }
  const { client } = makeLoginDb(tables, { auth_user_id_by_email: ({ p_email }) => opts.owners?.[p_email.toLowerCase()] ?? null })
  const fake = makeFakeAdmin(tables)
  // makeFakeAdmin хранит своих пользователей отдельно: заводим тех, что нужны сценарию
  fake.users.push({ id: ME, email: 'wa77001112233@wa.invalid', user_metadata: {} }, { id: OTHER, email: 'real@mail.kz', user_metadata: {} })
  const call = (email: string, code: string, now = NOW + 1000) => verifyEmailClaim(client, fake.admin, { userId: ME, email, code, redirectTo: REDIRECT, now })
  return { db: client, tables, ...fake, call }
}

describe('startEmailClaim', () => {
  it('в базе только хеш; новый код гасит прежний', async () => {
    const { db, tables } = setup()
    const c1 = await startEmailClaim(db, ME, 'a@b.kz', NOW)
    const c2 = await startEmailClaim(db, ME, 'a@b.kz', NOW + 1000)
    expect(c1).toMatch(/^\d{6}$/)
    expect(JSON.stringify(tables.email_claim_codes)).not.toContain(c2)
    expect(tables.email_claim_codes[0].consumed_at).not.toBeNull()
    expect(tables.email_claim_codes[1].consumed_at ?? null).toBeNull()
    expect(Date.parse(tables.email_claim_codes[1].expires_at)).toBe(NOW + 1000 + CLAIM_TTL_MS)
  })
})

describe('verifyEmailClaim', () => {
  it('свободная почта: становится почтой аккаунта, рассылки включаются', async () => {
    const s = setup()
    const code = await startEmailClaim(s.db, ME, 'new@mail.kz', NOW)
    const r = await s.call('New@Mail.kz', code)
    expect(r).toEqual({ ok: true, mode: 'attached' })
    expect(s.users.find(u => u.id === ME)!.email).toBe('new@mail.kz')
    expect(s.tables.profiles.find(p => p.id === ME)).toMatchObject({ email: 'new@mail.kz', email_optout: false, notify_email: true })
  })

  it('неверный код считает попытки; после пяти код гаснет даже для верного', async () => {
    const s = setup()
    const code = await startEmailClaim(s.db, ME, 'new@mail.kz', NOW)
    for (let i = 1; i < MAX_ATTEMPTS; i++) expect(await s.call('new@mail.kz', '000000')).toEqual({ ok: false, reason: 'wrong_code' })
    expect(await s.call('new@mail.kz', '000000')).toEqual({ ok: false, reason: 'too_many' })
    expect(await s.call('new@mail.kz', code)).toEqual({ ok: false, reason: 'too_many' })
    expect(s.users.find(u => u.id === ME)!.email).toBe('wa77001112233@wa.invalid')
  })

  it('просроченный, повторный и чужой код отклоняются', async () => {
    const s = setup()
    const code = await startEmailClaim(s.db, ME, 'new@mail.kz', NOW)
    expect(await s.call('new@mail.kz', code, NOW + CLAIM_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' })
    const code2 = await startEmailClaim(s.db, ME, 'new@mail.kz', NOW + 5000)
    expect((await s.call('new@mail.kz', code2, NOW + 6000)).ok).toBe(true)
    expect(await s.call('new@mail.kz', code2, NOW + 7000)).toEqual({ ok: false, reason: 'expired' })
    // код, выданный на другой адрес, к этому адресу не подходит
    const code3 = await startEmailClaim(s.db, ME, 'one@mail.kz', NOW + 8000)
    expect(await s.call('two@mail.kz', code3, NOW + 9000)).toEqual({ ok: false, reason: 'expired' })
  })

  it('почта другого аккаунта: номер переезжает туда, пустая заготовка удаляется, выдаётся вход-ссылка', async () => {
    const s = setup({ owners: { 'real@mail.kz': OTHER } })
    const code = await startEmailClaim(s.db, ME, 'real@mail.kz', NOW)
    const r = await s.call('real@mail.kz', code)
    expect(r.ok).toBe(true)
    if (r.ok && r.mode === 'linked') {
      expect(r.url).toContain('type=magiclink')
      expect(r.url).toContain(encodeURIComponent('real@mail.kz'))
    } else throw new Error('ожидался режим linked')
    expect(s.tables.whatsapp_identities).toEqual([{ wa_id: '77001112233', user_id: OTHER }])
    expect(s.log.deleted).toEqual([ME])
    expect(s.tables.profiles.find(p => p.id === ME)!.deleted_at).toBeTruthy()
  })

  it('в заготовке уже есть данные: ничего не переносим и не удаляем', async () => {
    const s = setup({ owners: { 'real@mail.kz': OTHER }, tables: { invoices: [{ id: 'i1', user_id: ME }] } })
    const code = await startEmailClaim(s.db, ME, 'real@mail.kz', NOW)
    expect(await s.call('real@mail.kz', code)).toEqual({ ok: false, reason: 'has_data' })
    expect(s.tables.whatsapp_identities[0].user_id).toBe(ME)
    expect(s.log.deleted).toHaveLength(0)
  })

  it('у того аккаунта уже привязан другой номер: отказ без изменений', async () => {
    const s = setup({
      owners: { 'real@mail.kz': OTHER },
      tables: { whatsapp_identities: [{ wa_id: '77001112233', user_id: ME }, { wa_id: '77009998877', user_id: OTHER }] },
    })
    const code = await startEmailClaim(s.db, ME, 'real@mail.kz', NOW)
    expect(await s.call('real@mail.kz', code)).toEqual({ ok: false, reason: 'other_has_number' })
    expect(s.log.deleted).toHaveLength(0)
  })

  it('isDisposableAccount: реквизиты или кошелёк делают аккаунт «не пустым»', async () => {
    expect(await isDisposableAccount(setup().db, ME)).toBe(true)
    expect(await isDisposableAccount(setup({ tables: { wallet_ledger: [{ id: 1, user_id: ME }] } }).db, ME)).toBe(false)
    expect(await isDisposableAccount(setup({ tables: { profiles: [{ id: ME, company_name: 'ТОО Ромашка' }] } }).db, ME)).toBe(false)
  })

  it('хеш кода привязан к человеку и адресу', () => {
    expect(hashClaimCode('u1', 'a@b.kz', '123456')).not.toBe(hashClaimCode('u2', 'a@b.kz', '123456'))
    expect(hashClaimCode('u1', 'a@b.kz', '123456')).not.toBe(hashClaimCode('u1', 'c@b.kz', '123456'))
  })
})
