import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
  tables: {} as Record<string, any>,
  exchange: vi.fn(),
  register: vi.fn(),
  subscribe: vi.fn(),
  display: vi.fn(),
  verified: vi.fn(),
  inWaba: vi.fn(),
}))

// Минимальный чейнабельный фейк supabase: select/eq/maybeSingle/single отдают
// заготовленную строку таблицы, upsert пишется в h.upsert.
function builder(table: string) {
  const b: any = {
    select: () => b,
    eq: () => b,
    maybeSingle: async () => ({ data: h.tables[table] ?? null }),
    single: async () => ({ data: h.tables[table] ?? null }),
    upsert: (...a: unknown[]) => h.upsert(...a),
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: h.getUser }, from: (t: string) => builder(t) }),
}))
vi.mock('@/lib/kaspiPay/crypto', () => ({ encryptAtRest: () => 'enc' }))
vi.mock('@/lib/aiAgent/connection', () => ({ getKey: () => Buffer.alloc(32) }))
vi.mock('@/lib/plan', () => ({ getActivePlan: () => ({ canAiAgent: true }) }))
vi.mock('@/lib/aiAgent/launchMark', () => ({ markLaunchedIfLive: vi.fn(async () => {}) }))
vi.mock('@/lib/whatsapp', () => ({
  exchangeWhatsAppCode: (...a: unknown[]) => h.exchange(...a),
  registerWhatsAppPhoneNumber: (...a: unknown[]) => h.register(...a),
  subscribeWhatsAppWebhooks: (...a: unknown[]) => h.subscribe(...a),
  getWhatsAppDisplayPhoneNumber: (...a: unknown[]) => h.display(...a),
  isWhatsAppPhoneNumberVerified: (...a: unknown[]) => h.verified(...a),
  isPhoneNumberInWaba: (...a: unknown[]) => h.inWaba(...a),
  WhatsAppApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

import { POST } from './route'

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/ai-agent/whatsapp/callback', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

const base = { agentId: 'agent-1', code: 'c', phoneNumberId: '111', wabaId: '222' }

describe('POST /api/ai-agent/whatsapp/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_WHATSAPP_APP_ID = 'app'
    process.env.WHATSAPP_APP_SECRET = 'secret'
    h.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    h.exchange.mockResolvedValue({ accessToken: 'at' })
    h.register.mockResolvedValue(undefined)
    h.subscribe.mockResolvedValue(undefined)
    h.display.mockResolvedValue('+7 777 000 00 00')
    h.verified.mockResolvedValue(true)
    h.inWaba.mockResolvedValue(true)
    h.upsert.mockResolvedValue({ error: null })
    // profiles -> is_admin; ai_agents -> агент принадлежит u1 (для проверки владения)
    h.tables = { profiles: { is_admin: true }, ai_agents: { id: 'agent-1', user_id: 'u1' }, ai_agent_channel_connections: null }
  })

  it('refuses a foreign phoneNumberId even when the client claims coexistence (takeover attempt)', async () => {
    h.inWaba.mockResolvedValue(false)
    const res = await POST(req({ ...base, esEvent: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' }))
    expect(res.status).toBe(403)
    expect(h.inWaba).toHaveBeenCalledWith('222', '111', 'at')
    expect(h.upsert).not.toHaveBeenCalled()
    expect(h.subscribe).not.toHaveBeenCalled()
  })

  it('rejects non-numeric ids before any Graph call', async () => {
    const res = await POST(req({ ...base, phoneNumberId: '111/../me' }))
    expect(res.status).toBe(400)
    expect(h.exchange).not.toHaveBeenCalled()
  })

  it('returns 409 when the number is connected to another user\'s agent, without overwriting', async () => {
    h.tables = {
      profiles: { is_admin: true },
      // и «мой агент», и «агент чужой строки» читаются из ai_agents -- у фейка одна строка на таблицу,
      // поэтому владельца чужого агента задаём тем же ответом с другим user_id
      ai_agents: { id: 'agent-1', user_id: 'someone-else' },
      ai_agent_channel_connections: { agent_id: 'victim-agent' },
    }
    // ownership агента запроса проходит только для u1 -- подменяем: первый вызов (агент u1), второй (чужой)
    let call = 0
    const orig = h.tables.ai_agents
    Object.defineProperty(h.tables, 'ai_agents', {
      configurable: true,
      get: () => (call++ === 0 ? { id: 'agent-1', user_id: 'u1' } : { ...orig, user_id: 'victim-user' }),
    })
    const res = await POST(req(base))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('number_already_connected')
    expect(body.detail).toMatch(/другому аккаунту/)
    expect(h.upsert).not.toHaveBeenCalled()
    expect(h.register).not.toHaveBeenCalled()
    expect(h.subscribe).not.toHaveBeenCalled()
  })

  it('allows the same agent to reconnect the same number', async () => {
    h.tables.ai_agent_channel_connections = { agent_id: 'agent-1' }
    const res = await POST(req(base))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, phoneNumberId: '111' })
    expect(h.upsert).toHaveBeenCalledTimes(1)
    expect(h.upsert.mock.calls[0][0]).toMatchObject({ agent_id: 'agent-1', external_account_id: '111', waba_id: '222', is_coexistence: false })
    expect(h.register).toHaveBeenCalled()
  })

  it('keeps the legit coexistence flow working: skips register, stores the flag', async () => {
    const res = await POST(req({ ...base, esEvent: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' }))
    expect(res.status).toBe(200)
    expect(h.register).not.toHaveBeenCalled()
    expect(h.upsert.mock.calls[0][0]).toMatchObject({ is_coexistence: true })
  })

  it('allows moving a number between agents of the same user', async () => {
    h.tables.ai_agent_channel_connections = { agent_id: 'other-agent-of-u1' }
    // оба агента (запрошенный и прежний) принадлежат u1 -- ai_agents отдаёт user_id u1
    const res = await POST(req(base))
    expect(res.status).toBe(200)
    expect(h.upsert).toHaveBeenCalledTimes(1)
  })
})
