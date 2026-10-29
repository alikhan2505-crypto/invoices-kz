import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendDirectMessage, sendDirectImage, sendInstagramFlowStep } from './instagram'

// Отправка сообщений Instagram: токен только в заголовке Authorization, не в теле и не в адресе
// (URL и тело не должны нести токен: адреса попадают в логи прокси и платформы).
const TOKEN = 'IGAA-secret-token-xyz'
const creds = { igUserId: 'ig1', accessToken: TOKEN }

describe('отправка сообщений: токен в заголовке', () => {
  const calls: { url: string; init: RequestInit }[] = []
  beforeEach(() => {
    calls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return { ok: true, status: 200, json: async () => ({ message_id: 'm1' }) }
    }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  const expectBearerOnly = () => {
    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]
    expect(url).toBe('https://graph.instagram.com/v21.0/ig1/messages')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(url).not.toContain(TOKEN)
    expect(String(init.body)).not.toContain(TOKEN)
    expect(String(init.body)).not.toContain('access_token')
  }

  it('sendDirectMessage', async () => {
    await sendDirectMessage('u1', 'привет', creds)
    expectBearerOnly()
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ recipient: { id: 'u1' }, message: { text: 'привет' } })
  })

  it('sendDirectImage', async () => {
    await sendDirectImage('u1', 'https://invoices.kz/x.png', creds)
    expectBearerOnly()
    expect(JSON.parse(String(calls[0].init.body)).message.attachment.payload.url).toBe('https://invoices.kz/x.png')
  })

  it('sendInstagramFlowStep', async () => {
    await sendInstagramFlowStep('u1', { id: 's1', text: 'Выберите', buttons: [] } as any, creds)
    expectBearerOnly()
    expect(JSON.parse(String(calls[0].init.body)).recipient).toEqual({ id: 'u1' })
  })

  it('ошибка Meta не раскрывает токен', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid parameter' } }) })))
    await expect(sendDirectMessage('u1', 'x', creds)).rejects.toThrow('Invalid parameter')
    await sendDirectMessage('u1', 'x', creds).catch(e => expect(String(e.message)).not.toContain(TOKEN))
  })
})
