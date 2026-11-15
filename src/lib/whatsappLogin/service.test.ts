import { describe, it, expect } from 'vitest'
import { claimLoginCode, createLoginCode, ensureUserForWaId, exchangeLoginToken } from './service'
import { CODE_TTL_MS, TOKEN_TTL_MS, hashSecret, placeholderEmailFor } from './helpers'
import { makeFakeAdmin, makeLoginDb } from './fakeLoginDb.testkit'

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0)
const WA = '77776970406'
const REDIRECT = 'https://invoices.kz/auth/callback'

function setup() {
  const { client, tables } = makeLoginDb()
  const fake = makeFakeAdmin(tables)
  return { db: client, tables, ...fake }
}

describe('createLoginCode / claimLoginCode', () => {
  it('в базе только хеш кода; код живёт 10 минут', async () => {
    const { db, tables } = setup()
    const code = await createLoginCode(db, { referral_code: 'r1' }, NOW)
    const row = tables.whatsapp_login_codes[0]
    expect(row.code_hash).toBe(hashSecret(code))
    expect(JSON.stringify(row)).not.toContain(code)
    expect(Date.parse(row.expires_at)).toBe(NOW + CODE_TTL_MS)
    expect(row.meta).toEqual({ referral_code: 'r1' })
  })

  it('первое сообщение с кодом выдаёт токен, второе с тем же кодом уже нет', async () => {
    const { db, tables } = setup()
    const code = await createLoginCode(db, {}, NOW)
    const first = await claimLoginCode(db, code, WA, NOW + 1000)
    expect(first).not.toBeNull()
    const row = tables.whatsapp_login_codes[0]
    expect(row.status).toBe('sent')
    expect(row.wa_id).toBe(WA)
    expect(row.token_hash).toBe(hashSecret(first!.token))
    expect(Date.parse(row.token_expires_at)).toBe(NOW + 1000 + TOKEN_TTL_MS)
    expect(await claimLoginCode(db, code, '77001112233', NOW + 2000)).toBeNull()
    expect(row.wa_id).toBe(WA) // чужой номер код не перехватил
  })

  it('просроченный и неизвестный код не находятся', async () => {
    const { db } = setup()
    const code = await createLoginCode(db, {}, NOW)
    expect(await claimLoginCode(db, code, WA, NOW + CODE_TTL_MS + 1)).toBeNull()
    expect(await claimLoginCode(db, 'ZZZZ2222', WA, NOW)).toBeNull()
  })

  it('параллельные сообщения с одним кодом: токен получает ровно одно', async () => {
    const { db } = setup()
    const code = await createLoginCode(db, {}, NOW)
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => claimLoginCode(db, code, `7700000000${i}`, NOW + 5)))
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})

describe('ensureUserForWaId', () => {
  it('новый номер: пользователь с служебным адресом, привязка, профиль без рассылок', async () => {
    const { db, tables, admin, users } = setup()
    const id = await ensureUserForWaId(db, admin, WA, { referral_code: 'r1', first_source: 'ig' })
    expect(users).toHaveLength(1)
    expect(users[0].email).toBe(placeholderEmailFor(WA))
    expect(users[0].user_metadata).toMatchObject({ referral_code: 'r1', first_source: 'ig', wa_login: true, wa_phone: `+${WA}` })
    expect(tables.whatsapp_identities).toEqual([expect.objectContaining({ wa_id: WA, user_id: id })])
    expect(tables.profiles[0]).toMatchObject({ id, email: null, email_optout: true, notify_email: false, phone: `+${WA}` })
  })

  it('тот же номер второй раз: тот же аккаунт, второго пользователя нет', async () => {
    const { db, admin, users } = setup()
    const a = await ensureUserForWaId(db, admin, WA, {})
    const b = await ensureUserForWaId(db, admin, WA, { referral_code: 'late' })
    expect(b).toBe(a)
    expect(users).toHaveLength(1)
  })

  it('сбой между созданием пользователя и привязкой: следующая попытка находит его по профилю', async () => {
    const { db, tables, admin, users } = setup()
    const orphan = await admin.createUser({ email: placeholderEmailFor(WA), user_metadata: {} })
    expect(tables.whatsapp_identities ?? []).toHaveLength(0)
    const id = await ensureUserForWaId(db, admin, WA, {})
    expect(id).toBe(orphan.data.user!.id)
    expect(users).toHaveLength(1)
    expect(tables.whatsapp_identities).toHaveLength(1)
  })
})

describe('exchangeLoginToken', () => {
  async function sentToken(s: ReturnType<typeof setup>, meta = {}) {
    const code = await createLoginCode(s.db, meta, NOW)
    const claim = await claimLoginCode(s.db, code, WA, NOW + 1000)
    return claim!.token
  }

  it('рабочий токен: аккаунт создан, выдана вход-ссылка на /auth/callback, токен погашен', async () => {
    const s = setup()
    const token = await sentToken(s, { post_login_next: '/kaspi' })
    const res = await exchangeLoginToken(s.db, s.admin, token, REDIRECT, NOW + 2000)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.url).toContain('type=magiclink')
      expect(res.url).toContain(encodeURIComponent(placeholderEmailFor(WA)))
      expect(res.url).toContain(encodeURIComponent(REDIRECT))
    }
    expect(s.tables.whatsapp_login_codes[0].status).toBe('consumed')
    expect(s.users[0].user_metadata).toMatchObject({ post_login_next: '/kaspi' })
  })

  it('второе открытие той же ссылки и чужой токен отклоняются', async () => {
    const s = setup()
    const token = await sentToken(s)
    expect((await exchangeLoginToken(s.db, s.admin, token, REDIRECT, NOW + 2000)).ok).toBe(true)
    expect(await exchangeLoginToken(s.db, s.admin, token, REDIRECT, NOW + 3000)).toEqual({ ok: false, reason: 'invalid' })
    expect(await exchangeLoginToken(s.db, s.admin, 'nope'.repeat(10), REDIRECT, NOW + 3000)).toEqual({ ok: false, reason: 'invalid' })
    expect(s.users).toHaveLength(1)
  })

  it('просроченная ссылка не работает и аккаунт не создаёт', async () => {
    const s = setup()
    const token = await sentToken(s)
    expect(await exchangeLoginToken(s.db, s.admin, token, REDIRECT, NOW + 1000 + TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: 'invalid' })
    expect(s.users).toHaveLength(0)
  })

  it('возвращающийся человек: тот же аккаунт', async () => {
    const s = setup()
    const t1 = await sentToken(s)
    await exchangeLoginToken(s.db, s.admin, t1, REDIRECT, NOW + 2000)
    const code2 = await createLoginCode(s.db, {}, NOW + 5000)
    const t2 = (await claimLoginCode(s.db, code2, WA, NOW + 6000))!.token
    expect((await exchangeLoginToken(s.db, s.admin, t2, REDIRECT, NOW + 7000)).ok).toBe(true)
    expect(s.users).toHaveLength(1)
  })
})
