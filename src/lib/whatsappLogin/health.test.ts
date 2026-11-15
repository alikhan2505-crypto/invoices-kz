import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkWhatsAppLoginHealth, healthAlertText } from './health'

const CFG = { phoneNumberId: 'pn1', displayNumber: '+7 777 000 00 00' }
const conn = async () => ({ accessToken: 'tok' })
const reply = (status: number, body?: unknown) => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('checkWhatsAppLoginHealth', () => {
  it('нет настроек: вход выключен, это не поломка', async () => {
    expect(await checkWhatsAppLoginHealth({ cfg: null, loadConnection: conn })).toEqual({ state: 'off' })
  })

  it('нет активного подключения: down', async () => {
    const r = await checkWhatsAppLoginHealth({ cfg: CFG, loadConnection: async () => null })
    expect(r.state).toBe('down')
  })

  it('Meta отвергла токен или номер отключён: down', async () => {
    expect((await checkWhatsAppLoginHealth({ cfg: CFG, loadConnection: conn, fetchImpl: reply(401) })).state).toBe('down')
    expect((await checkWhatsAppLoginHealth({ cfg: CFG, loadConnection: conn, fetchImpl: reply(400, { error: { code: 190 } }) })).state).toBe('down')
    expect((await checkWhatsAppLoginHealth({ cfg: CFG, loadConnection: conn, fetchImpl: reply(200, { status: 'DISCONNECTED' }) })).state).toBe('down')
    expect((await checkWhatsAppLoginHealth({ cfg: CFG, loadConnection: conn, fetchImpl: reply(200, { status: 'banned' }) })).state).toBe('down')
  })

  it('номер на связи, ограничен или Meta ответила странно: кнопка остаётся (не прячем без доказательства)', async () => {
    for (const f of [reply(200, { status: 'CONNECTED' }), reply(200, { status: 'FLAGGED' }), reply(200, {}), reply(500), reply(200), reply(403, { error: { code: 10 } }), reply(400, { error: { code: 100 } })]) {
      expect(await checkWhatsAppLoginHealth({ cfg: CFG, loadConnection: conn, fetchImpl: f })).toEqual({ state: 'ok' })
    }
  })

  it('сбой сети или базы не прячет кнопку', async () => {
    const boom = (async () => { throw new Error('network') }) as unknown as typeof fetch
    expect(await checkWhatsAppLoginHealth({ cfg: CFG, loadConnection: conn, fetchImpl: boom })).toEqual({ state: 'ok' })
    expect(await checkWhatsAppLoginHealth({ cfg: CFG, loadConnection: async () => { throw new Error('db') }, fetchImpl: reply(200, { status: 'CONNECTED' }) })).toEqual({ state: 'ok' })
  })

  it('токен уходит в Meta только заголовком, не в адресе', async () => {
    const seen: string[] = []
    const f = (async (url: string, init: RequestInit) => { seen.push(url, JSON.stringify(init.headers)); return new Response('{"status":"CONNECTED"}') }) as unknown as typeof fetch
    await checkWhatsAppLoginHealth({ cfg: CFG, loadConnection: conn, fetchImpl: f })
    expect(seen[0]).not.toContain('tok')
    expect(seen[1]).toContain('Bearer tok')
  })

  it('текст тревоги говорит, что делать', () => {
    expect(healthAlertText('причина')).toContain('откройте WhatsApp Business')
  })
})
