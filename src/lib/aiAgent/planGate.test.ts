import { describe, it, expect, vi } from 'vitest'
import { hasAiAgentPlan, aiAgentAccessLevel, agentCanReply, agentReplyState, storesInboundOnly } from './planGate'

const future = () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
const past = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

function fakeSupabase(result: { data: unknown; error: unknown }) {
  const from = vi.fn(() => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => result,
    }
    return builder
  })
  return { from } as any
}

describe('hasAiAgentPlan', () => {
  it('Про без срока и с будущим сроком -- да', () => {
    expect(hasAiAgentPlan({ plan: 'pro' })).toBe(true)
    expect(hasAiAgentPlan({ plan: 'pro', plan_expires_at: future() })).toBe(true)
  })
  it('истёкший Про -- нет', () => {
    expect(hasAiAgentPlan({ plan: 'pro', plan_expires_at: past() })).toBe(false)
  })
  it('Базовый, бонус, пробный, нет профиля -- нет', () => {
    expect(hasAiAgentPlan({ plan: 'basic' })).toBe(false)
    expect(hasAiAgentPlan({ bonus_expires_at: future() })).toBe(false)
    expect(hasAiAgentPlan({ trial_expires_at: future() })).toBe(false)
    expect(hasAiAgentPlan(null)).toBe(false)
  })
  it('админ -- всегда да, даже с истёкшим Про', () => {
    expect(hasAiAgentPlan({ is_admin: true })).toBe(true)
    expect(hasAiAgentPlan({ is_admin: true, plan: 'pro', plan_expires_at: past() })).toBe(true)
  })
})

describe('aiAgentAccessLevel', () => {
  it('Про -- full, независимо от агентов', () => {
    expect(aiAgentAccessLevel({ plan: 'pro' }, false)).toBe('full')
    expect(aiAgentAccessLevel({ plan: 'pro' }, true)).toBe('full')
  })
  it('Про кончился, агенты есть -- переписка на чтение', () => {
    expect(aiAgentAccessLevel({ plan: 'pro', plan_expires_at: past() }, true)).toBe('read_only')
  })
  it('без тарифа и без агентов -- none', () => {
    expect(aiAgentAccessLevel({ plan: 'free' }, false)).toBe('none')
  })
})

describe('agentReplyState (A2)', () => {
  it('выключен владельцем или черновик -- paused, профиль не читается', async () => {
    const sb = fakeSupabase({ data: { plan: 'pro' }, error: null })
    expect(await agentReplyState(sb, { is_enabled: false, user_id: 'u1' })).toBe('paused')
    expect(await agentReplyState(sb, null)).toBe('paused')
    expect(sb.from).not.toHaveBeenCalled()
  })
  it('Про есть -- reply; Про кончился -- lapsed', async () => {
    expect(await agentReplyState(fakeSupabase({ data: { plan: 'pro' }, error: null }), { is_enabled: true, user_id: 'u1' })).toBe('reply')
    expect(await agentReplyState(fakeSupabase({ data: { plan: 'pro', plan_expires_at: past() }, error: null }), { is_enabled: true, user_id: 'u1' })).toBe('lapsed')
  })
  it('сбой чтения профиля -- unknown (без ответа, но и без «Про кончился»)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await agentReplyState(fakeSupabase({ data: null, error: { message: 'boom' } }), { is_enabled: true, user_id: 'u1' })).toBe('unknown')
    spy.mockRestore()
  })
  it('сохраняем без ответа только живого агента без Про', () => {
    expect(storesInboundOnly('lapsed')).toBe(true)
    expect(storesInboundOnly('unknown')).toBe(true)
    expect(storesInboundOnly('paused')).toBe(false)
    expect(storesInboundOnly('reply')).toBe(false)
  })
})

describe('agentCanReply', () => {
  it('выключенный агент -- нет, профиль даже не читается', async () => {
    const sb = fakeSupabase({ data: { plan: 'pro' }, error: null })
    expect(await agentCanReply(sb, { is_enabled: false, user_id: 'u1' })).toBe(false)
    expect(sb.from).not.toHaveBeenCalled()
  })
  it('включён, у владельца Про -- да', async () => {
    expect(await agentCanReply(fakeSupabase({ data: { plan: 'pro' }, error: null }), { is_enabled: true, user_id: 'u1' })).toBe(true)
  })
  it('null в is_enabled (строка до колонки) читается как включён', async () => {
    expect(await agentCanReply(fakeSupabase({ data: { plan: 'pro' }, error: null }), { is_enabled: null, user_id: 'u1' })).toBe(true)
  })
  it('включён, но Про кончился -- нет (бот молчит и не списывает)', async () => {
    expect(await agentCanReply(fakeSupabase({ data: { plan: 'pro', plan_expires_at: past() }, error: null }), { is_enabled: true, user_id: 'u1' })).toBe(false)
  })
  it('админ с истёкшим Про -- да', async () => {
    expect(await agentCanReply(fakeSupabase({ data: { is_admin: true, plan: 'pro', plan_expires_at: past() }, error: null }), { is_enabled: true, user_id: 'u1' })).toBe(true)
  })
  it('ошибка чтения профиля -- нет (fail closed)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await agentCanReply(fakeSupabase({ data: null, error: { message: 'boom' } }), { is_enabled: true, user_id: 'u1' })).toBe(false)
    spy.mockRestore()
  })
  it('нет агента или владельца -- нет', async () => {
    const sb = fakeSupabase({ data: { plan: 'pro' }, error: null })
    expect(await agentCanReply(sb, null)).toBe(false)
    expect(await agentCanReply(sb, { is_enabled: true, user_id: null })).toBe(false)
  })
})
