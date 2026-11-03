import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  return {
    tokens: {} as Record<string, { id: string }>,
    referrer: null as { id: string } | null,
    me: null as { referred_by: string | null } | null,
    rpc: {} as Record<string, { data: unknown; error: { message: string } | null }>,
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    if (key === 'anon-key') {
      return { auth: { getUser: async (t: string) => ({ data: { user: h.tokens[t] ?? null } }) } }
    }
    return {
      from: () => {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.eq = () => b
        b.single = async () => ({ data: h.referrer })
        b.maybeSingle = async () => ({ data: h.me })
        return b
      },
      rpc: async (name: string, args: Record<string, unknown>) => {
        h.rpcCalls.push({ name, args })
        return h.rpc[name] ?? { data: null, error: null }
      },
    }
  },
}))

import { POST } from './route'

const post = (body: unknown, token?: string) =>
  new NextRequest('http://localhost/api/referral', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
const call = (body: unknown = { userId: 'u1', referralCode: 'abcd1234' }) => POST(post(body, 'tok'))
const until = '2026-11-10T00:00:00'

describe('/api/referral', () => {
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    h.tokens = { tok: { id: 'u1' } }
    h.referrer = { id: 'r1' }
    h.me = { referred_by: null }
    h.rpc = {
      claim_referral_bonus: { data: until, error: null },
      credit_referrer_bonus: { data: until, error: null },
    }
    h.rpcCalls = []
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
    error.mockRestore()
  })

  it('без токена другого аккаунта: 401, база не тронута', async () => {
    expect((await POST(post({ userId: 'u1', referralCode: 'x' }))).status).toBe(401)
    expect((await POST(post({ userId: 'u2', referralCode: 'x' }, 'tok'))).status).toBe(401)
    expect(h.rpcCalls).toEqual([])
  })

  it('неизвестный код: 404; собственный код: 400; в обоих случаях бонус не начислен', async () => {
    h.referrer = null
    expect((await call()).status).toBe(404)
    h.referrer = { id: 'u1' }
    expect((await call()).status).toBe(400)
    expect(h.rpcCalls).toEqual([])
  })

  it('новый аккаунт: бонус обоим на 7 дней, без ошибок в логах', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(h.rpcCalls).toEqual([
      { name: 'claim_referral_bonus', args: { p_user: 'u1', p_code: 'abcd1234', p_days: 7 } },
      { name: 'credit_referrer_bonus', args: { p_referrer: 'r1', p_days: 7 } },
    ])
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('ошибка базы при начислении новичку: 500, реферера не трогаем', async () => {
    h.rpc.claim_referral_bonus = { data: null, error: { message: 'boom' } }
    expect((await call()).status).toBe(500)
    expect(h.rpcCalls.map(c => c.name)).toEqual(['claim_referral_bonus'])
  })

  it('аккаунт старше 2 суток: 400 с причиной, реферера не награждаем', async () => {
    h.rpc.claim_referral_bonus = { data: null, error: null }
    h.me = { referred_by: null }
    const res = await call()
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ reason: 'account_too_old' })
    expect(h.rpcCalls.map(c => c.name)).toEqual(['claim_referral_bonus'])
  })

  it('код уже применён: 400 «Already used», реферера не награждаем', async () => {
    h.rpc.claim_referral_bonus = { data: null, error: null }
    h.me = { referred_by: 'zzzz9999' }
    const res = await call()
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Already used referral code', reason: 'already_referred' })
    expect(h.rpcCalls.map(c => c.name)).toEqual(['claim_referral_bonus'])
  })

  it('нет строки профиля: 400 с отдельной причиной', async () => {
    h.rpc.claim_referral_bonus = { data: null, error: null }
    h.me = null
    expect(await (await call()).json()).toMatchObject({ reason: 'profile_missing' })
  })

  it('у реферера лимит 10: новичок получил своё, ответ 200, в логах предупреждение, не ошибка', async () => {
    h.rpc.credit_referrer_bonus = { data: null, error: null }
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('10')
    expect(error).not.toHaveBeenCalled()
  })

  it('сбой начисления рефереру: 200 для новичка, ошибка в логах (чтобы начислить руками)', async () => {
    h.rpc.credit_referrer_bonus = { data: null, error: { message: 'down' } }
    expect((await call()).status).toBe(200)
    expect(error).toHaveBeenCalledTimes(1)
  })
})
