import { describe, it, expect, vi, beforeEach } from 'vitest'
import { claimLinkCode, confirmLink, createLinkCode, linkedWaId, maskWaId, unlinkWhatsApp, MAX_CONFIRM_ATTEMPTS } from './link'
import { claimLoginCode } from './service'
import { handleLoginMessage } from './webhook'
import { LINK_REPLY_MARKER, TOKEN_TTL_MS, CODE_TTL_MS, buildLinkWaMeUrl, parseLinkMessage, parseLoginMessage } from './helpers'
import { makeLoginDb } from './fakeLoginDb.testkit'

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0)
const ME = 'user-1'
const WA = '77001112233'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

function setup(tables: Record<string, any[]> = {}) {
  const { client, tables: t } = makeLoginDb(tables)
  return { db: client, tables: t }
}
/** Весь путь до кода подтверждения: код привязки → сообщение с номера → 6-значный код. */
async function toConfirm(s: ReturnType<typeof setup>, waId = WA) {
  const code = await createLinkCode(s.db, ME, NOW)
  const claim = await claimLinkCode(s.db, code, waId, NOW + 1000)
  return { code, confirm: claim!.confirm }
}

describe('разбор сообщений', () => {
  it('«Привязать <код>» отличается от «Вход <код>»', () => {
    expect(parseLinkMessage('Привязать ABCD2345')).toBe('ABCD2345')
    expect(parseLinkMessage(' привязать  abcd2345 ')).toBe('ABCD2345')
    expect(parseLinkMessage('Вход ABCD2345')).toBeNull()
    expect(parseLoginMessage('Привязать ABCD2345')).toBeNull()
    expect(parseLinkMessage('Привязать номер пожалуйста')).toBeNull()
    expect(buildLinkWaMeUrl('+7 777 000 00 00', 'ABCD2345')).toContain('https://wa.me/77770000000?text=')
  })
})

describe('создание и получение кода', () => {
  it('код привязки хранится хешем с владельцем; новый гасит прежний', async () => {
    const s = setup()
    const c1 = await createLinkCode(s.db, ME, NOW)
    const c2 = await createLinkCode(s.db, ME, NOW + 1000)
    expect(JSON.stringify(s.tables.whatsapp_login_codes)).not.toContain(c2)
    expect(s.tables.whatsapp_login_codes[0]).toMatchObject({ purpose: 'link', link_user_id: ME, status: 'consumed' })
    expect(s.tables.whatsapp_login_codes[1]).toMatchObject({ purpose: 'link', link_user_id: ME, status: 'pending' })
    expect(Date.parse(s.tables.whatsapp_login_codes[1].expires_at)).toBe(NOW + 1000 + CODE_TTL_MS)
    expect(await claimLinkCode(s.db, c1, WA, NOW + 2000)).toBeNull() // старый код уже не работает
  })

  it('код привязки нельзя использовать как код ВХОДА и наоборот', async () => {
    const s = setup()
    const linkCode = await createLinkCode(s.db, ME, NOW)
    expect(await claimLoginCode(s.db, linkCode, WA, NOW + 1000)).toBeNull()
    expect(s.tables.whatsapp_login_codes[0].status).toBe('pending')
  })
})

describe('confirmLink', () => {
  it('полный путь: номер привязан к аккаунту того, кто ввёл код', async () => {
    const s = setup()
    const { confirm } = await toConfirm(s)
    expect(await confirmLink(s.db, ME, confirm, NOW + 2000)).toEqual({ ok: true, waId: WA })
    expect(await linkedWaId(s.db, ME)).toBe(WA)
  })

  it('код подтверждения чужого аккаунта не подходит', async () => {
    const s = setup()
    const { confirm } = await toConfirm(s)
    expect(await confirmLink(s.db, 'user-2', confirm, NOW + 2000)).toEqual({ ok: false, reason: 'expired' })
    expect(await linkedWaId(s.db, 'user-2')).toBeNull()
  })

  it('неверный код считает попытки, после пяти даже верный не принимается', async () => {
    const s = setup()
    const { confirm } = await toConfirm(s)
    const wrong = confirm === '000000' ? '111111' : '000000'
    for (let i = 1; i < MAX_CONFIRM_ATTEMPTS; i++) expect(await confirmLink(s.db, ME, wrong, NOW + 2000)).toEqual({ ok: false, reason: 'wrong_code' })
    expect(await confirmLink(s.db, ME, wrong, NOW + 2000)).toEqual({ ok: false, reason: 'too_many' })
    expect(await confirmLink(s.db, ME, confirm, NOW + 2000)).toEqual({ ok: false, reason: 'too_many' })
    expect(await linkedWaId(s.db, ME)).toBeNull()
  })

  it('просроченный и повторный коды отклоняются', async () => {
    const s = setup()
    const { confirm } = await toConfirm(s)
    expect(await confirmLink(s.db, ME, confirm, NOW + 1000 + TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' })
    const s2 = setup()
    const t2 = await toConfirm(s2)
    expect((await confirmLink(s2.db, ME, t2.confirm, NOW + 2000)).ok).toBe(true)
    expect(await confirmLink(s2.db, ME, t2.confirm, NOW + 3000)).toEqual({ ok: false, reason: 'expired' })
  })

  it('номер уже привязан к другому аккаунту: отказ; у аккаунта уже есть номер: отказ', async () => {
    const taken = setup({ whatsapp_identities: [{ wa_id: WA, user_id: 'other' }] })
    const a = await toConfirm(taken)
    expect(await confirmLink(taken.db, ME, a.confirm, NOW + 2000)).toEqual({ ok: false, reason: 'taken' })
    expect(taken.tables.whatsapp_identities).toEqual([{ wa_id: WA, user_id: 'other' }])

    const has = setup({ whatsapp_identities: [{ wa_id: '77009998877', user_id: ME }] })
    const b = await toConfirm(has)
    expect(await confirmLink(has.db, ME, b.confirm, NOW + 2000)).toEqual({ ok: false, reason: 'already_linked' })
  })

  it('отвязка убирает номер; маска скрывает середину', async () => {
    const s = setup({ whatsapp_identities: [{ wa_id: WA, user_id: ME }] })
    await unlinkWhatsApp(s.db, ME)
    expect(await linkedWaId(s.db, ME)).toBeNull()
    expect(maskWaId(WA)).toBe('+7•••2233')
  })
})

describe('вебхук: сообщение «Привязать <код>»', () => {
  const CFG = { phoneNumberId: 'pn-login', displayNumber: '+7 777 697 04 06' }

  it('верный код: в ответ уходит 6-значный код с предупреждением, агенту сообщение не отдаётся', async () => {
    const s = setup()
    const code = await createLinkCode(s.db, ME, NOW)
    const sent: string[] = []
    const handled = await handleLoginMessage({ db: s.db, phoneNumberId: 'pn-login', from: WA, text: `Привязать ${code}`, send: async t => { sent.push(t) }, cfg: CFG, now: NOW + 1000 })
    expect(handled).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain(LINK_REPLY_MARKER)
    expect(sent[0]).toMatch(/\d{6}/)
    expect(sent[0]).toContain('Никому его не сообщайте')
    expect(sent[0]).not.toContain('/auth/wa?t=')
  })

  it('неизвестный или повторный код: «код устарел», ссылки и кода подтверждения нет', async () => {
    const s = setup()
    const sent: string[] = []
    const handled = await handleLoginMessage({ db: s.db, phoneNumberId: 'pn-login', from: WA, text: 'Привязать ZZZZ2222', send: async t => { sent.push(t) }, cfg: CFG, now: NOW })
    expect(handled).toBe(true)
    expect(sent[0]).toContain('устарел')
    expect(sent[0]).not.toMatch(/\d{6}/)
  })
})
