import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleLoginMessage, LOGINS_PER_NUMBER_PER_HOUR, LOGIN_LINK_BASE } from './webhook'
import { createLoginCode } from './service'
import { EXPIRED_CODE_REPLY } from './helpers'
import { makeLoginDb } from './fakeLoginDb.testkit'

const CFG = { phoneNumberId: 'pn-login', displayNumber: '+7 777 697 04 06' }
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0)

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

function setup() {
  const { client, tables } = makeLoginDb()
  const sent: string[] = []
  const call = (text: string, over: Partial<Parameters<typeof handleLoginMessage>[0]> = {}) => handleLoginMessage({
    db: client, phoneNumberId: 'pn-login', from: '77776970406', text, send: async (t) => { sent.push(t) }, cfg: CFG, now: NOW + 1000, ...over,
  })
  return { db: client, tables, sent, call }
}

describe('handleLoginMessage', () => {
  it('вход выключен (нет настроек): ничего не забирает, агент видит всё как раньше', async () => {
    const { call, sent } = setup()
    expect(await call('Вход ABCD2345', { cfg: null })).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('сообщение на другой номер (на номера клиентов агента) не трогает', async () => {
    const { db, call, sent } = setup()
    const code = await createLoginCode(db, {}, NOW)
    expect(await call(`Вход ${code}`, { phoneNumberId: 'pn-seller' })).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('обычные сообщения клиентов идут к агенту', async () => {
    const { call, sent } = setup()
    for (const text of ['Здравствуйте, сколько стоит?', 'Вход в офис со двора?', 'Вход', 'Вход ABCD']) expect(await call(text)).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('верный код: человеку уходит ссылка, агенту сообщение не отдаётся', async () => {
    const { db, call, sent, tables } = setup()
    const code = await createLoginCode(db, {}, NOW)
    expect(await call(`Вход ${code}`)).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain(LOGIN_LINK_BASE)
    const token = sent[0].match(/\?t=([A-Za-z0-9_-]+)/)![1]
    expect(token).toHaveLength(43)
    expect(tables.whatsapp_login_codes[0].status).toBe('sent')
  })

  it('повтор того же кода и просроченный код: короткий ответ «код устарел», ссылки нет', async () => {
    const { db, call, sent } = setup()
    const code = await createLoginCode(db, {}, NOW)
    await call(`Вход ${code}`)
    sent.length = 0
    expect(await call(`Вход ${code}`)).toBe(true)
    expect(sent).toEqual([EXPIRED_CODE_REPLY])
    expect(sent[0]).not.toContain(LOGIN_LINK_BASE)
  })

  it('больше 6 ссылок в час на один номер: молчим, агенту всё равно не отдаём', async () => {
    const { db, call, sent } = setup()
    for (let i = 0; i < LOGINS_PER_NUMBER_PER_HOUR + 3; i++) {
      const code = await createLoginCode(db, {}, NOW)
      expect(await call(`Вход ${code}`)).toBe(true)
    }
    expect(sent.filter(t => t.includes(LOGIN_LINK_BASE))).toHaveLength(LOGINS_PER_NUMBER_PER_HOUR)
  })

  it('сбой отправки не роняет вебхук и не отдаёт сообщение агенту', async () => {
    const { db, call } = setup()
    const code = await createLoginCode(db, {}, NOW)
    expect(await call(`Вход ${code}`, { send: async () => { throw new Error('graph 500') } })).toBe(true)
  })
})
