import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Сообщение клиенту из планировщика: кривое тело - 400, а сырой текст ответа канала
// (Telegram, WhatsApp, Instagram API) и ошибки базы не уходят в ответ (аудит 02.11.2026, раздел 4).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})
const h = vi.hoisted(() => ({
  send: vi.fn(),
  session: { siteId: 'site1', ownerProfileId: 'o1' } as unknown,
  messagesError: null as { message: string } | null,
  pauses: [] as unknown[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      let isUpdate = false
      const b: any = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        update: (p: unknown) => { isUpdate = true; h.pauses.push(p); return b },
        maybeSingle: async () => {
          if (table === 'salon_bookings') return { data: { id: 'b1', site_id: 'site1', conversation_id: 'c1' }, error: null }
          return { data: { id: 'c1', agent_id: 'a1', channel: 'whatsapp', external_thread_id: '7771234567', paused_for_human: false }, error: null }
        },
        // await на цепочке: история сообщений или обновление паузы.
        then: (res: any, rej: any) => Promise.resolve(
          isUpdate ? { error: null }
            : h.messagesError ? { data: null, error: h.messagesError }
            : { data: [{ id: 'm1', direction: 'inbound', text: 'Привет', is_ai_generated: false, created_at: '2026-11-03T10:00:00Z' }], error: null },
        ).then(res, rej),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/plannerAuth', () => ({ requirePlannerSession: async () => h.session }))
vi.mock('@/lib/aiAgent/channelSend', () => ({ sendIntoConversation: h.send }))

import { GET, POST } from './route'

const params = { params: Promise.resolve({ id: 'b1' }) }
const post = (raw: string) => POST(new NextRequest('http://localhost/api/planner/bookings/b1/message', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
}), params)

beforeEach(() => {
  h.send.mockReset()
  h.send.mockResolvedValue(null)
  h.session = { siteId: 'site1', ownerProfileId: 'o1' }
  h.messagesError = null
  h.pauses = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/planner/bookings/[id]/message', () => {
  it('без сессии планировщика: 401, отправки нет', async () => {
    h.session = { error: 'Unauthorized', status: 401 }
    expect((await post(JSON.stringify({ text: 'hi' }))).status).toBe(401)
    expect(h.send).not.toHaveBeenCalled()
  })

  it('кривое тело (не JSON, пустое, не объект, text не строка): 400, отправки нет', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '{"text":123}', '{"text":{"a":1}}', '{"text":"   "}']) {
      const res = await post(raw)
      expect(res.status, raw).toBe(400)
    }
    expect(h.send).not.toHaveBeenCalled()
  })

  it('успешная отправка: 200 и пауза ИИ, как раньше', async () => {
    const res = await post(JSON.stringify({ text: ' Здравствуйте ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(h.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'c1' }), 'Здравствуйте')
    expect(h.pauses).toEqual([{ paused_for_human: true }])
  })

  it('канал вернул ошибку: 502 с общим текстом, сырой текст ответа API наружу не уходит, пауза не ставится, детали в логе', async () => {
    h.send.mockResolvedValue('(#131030) Recipient phone number 77771234567 not in allowed list; access_token=EAAB123')
    const res = await post(JSON.stringify({ text: 'Здравствуйте' }))
    expect(res.status).toBe(502)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось отправить сообщение"}')
    expect(text).not.toContain('131030')
    expect(text).not.toContain('access_token')
    expect(h.pauses).toHaveLength(0)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('planner booking message'), expect.stringContaining('131030'))
  })
})

describe('GET /api/planner/bookings/[id]/message', () => {
  it('история сообщений как раньше', async () => {
    const res = await GET(new NextRequest('http://localhost/x'), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messages: [{ id: 'm1', direction: 'inbound', text: 'Привет', isAiGenerated: false, createdAt: '2026-11-03T10:00:00Z' }] })
  })

  it('сбой базы: 502 с общим текстом, без текста ошибки', async () => {
    h.messagesError = { message: 'relation "ai_agent_messages" does not exist' }
    const res = await GET(new NextRequest('http://localhost/x'), params)
    expect(res.status).toBe(502)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось загрузить переписку"}')
    expect(text).not.toContain('ai_agent_messages')
  })
})
