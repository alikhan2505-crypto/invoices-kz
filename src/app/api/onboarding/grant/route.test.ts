import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  read: { data: { trial_expires_at: null }, error: null } as { data: { trial_expires_at: string | null } | null; error: { message: string } | null },
  update: { data: [{ id: 'u1' }], error: null } as { data: Array<{ id: string }> | null; error: { message: string } | null },
  reread: { data: { trial_expires_at: '2026-11-10T00:00:00.000Z' } } as { data: { trial_expires_at: string | null } | null },
  updateCalls: [] as unknown[],
  reads: 0,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            h.reads++
            return h.reads === 1 ? h.read : h.reread
          },
        }),
      }),
      update: (patch: unknown) => {
        h.updateCalls.push(patch)
        return { eq: () => ({ is: () => ({ select: async () => h.update }) }) }
      },
    }),
  }),
}))

import { POST } from './route'

const call = (auth: string | null = 'tok') =>
  POST(new Request('http://localhost/api/onboarding/grant', { method: 'POST', headers: auth ? { authorization: `Bearer ${auth}` } : {} }) as never)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.user = { id: 'u1' }
  h.read = { data: { trial_expires_at: null }, error: null }
  h.update = { data: [{ id: 'u1' }], error: null }
  h.reread = { data: { trial_expires_at: '2026-11-10T00:00:00.000Z' } }
  h.updateCalls = []
  h.reads = 0
})

describe('POST /api/onboarding/grant', () => {
  it('без входа - 401', async () => {
    h.user = null
    expect((await call(null)).status).toBe(401)
  })

  it('профиль есть, срока нет: записывает +7 суток и отдаёт именно этот срок', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const { trialExpiresAt } = await res.json()
    expect(h.updateCalls).toEqual([{ trial_expires_at: trialExpiresAt }])
    const days = (Date.parse(trialExpiresAt) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThan(7.01)
  })

  it('срок уже выдан: ничего не пишет, отдаёт прежний', async () => {
    h.read = { data: { trial_expires_at: '2026-11-05T00:00:00.000Z' }, error: null }
    const res = await call()
    expect(await res.json()).toEqual({ trialExpiresAt: '2026-11-05T00:00:00.000Z' })
    expect(h.updateCalls).toEqual([])
  })

  it('запись не удалась - 500, а не срок, которого в базе нет', async () => {
    h.update = { data: null, error: { message: 'db down' } }
    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to grant trial' })
  })

  it('профиля ещё нет - 404, вызывающий повторит', async () => {
    h.read = { data: null, error: null }
    const res = await call()
    expect(res.status).toBe(404)
    expect(h.updateCalls).toEqual([])
  })

  it('ошибка чтения профиля - 500', async () => {
    h.read = { data: null, error: { message: 'timeout' } }
    expect((await call()).status).toBe(500)
  })

  it('параллельный вызов успел раньше (update не задел строк): отдаём срок, записанный им', async () => {
    h.update = { data: [], error: null }
    const res = await call()
    expect(await res.json()).toEqual({ trialExpiresAt: '2026-11-10T00:00:00.000Z' })
  })

  it('update не задел строк и срока в базе так и нет - 500', async () => {
    h.update = { data: [], error: null }
    h.reread = { data: null }
    expect((await call()).status).toBe(500)
  })
})
