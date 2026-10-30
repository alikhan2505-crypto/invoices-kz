import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  profiles: {} as Record<string, { is_admin?: boolean; deleted_at?: string | null }>,
  tokens: {} as Record<string, string>,
  dbError: false,
  run: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => (h.tokens[token]
        ? { data: { user: { id: h.tokens[token] } }, error: null }
        : { data: { user: null }, error: { message: 'bad jwt' } }),
    },
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () => (h.dbError
            ? { data: null, error: { message: 'down' } }
            : { data: h.profiles[id] ?? null, error: null }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/personCheck/run', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/personCheck/run')>()
  return { ...real, runPersonCheck: h.run }
})

import { GET, POST } from './route'

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GONE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const IIN = '900101300017'

const req = (method: string, token: string | null, body?: unknown) =>
  new NextRequest('http://localhost/api/person-check', {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  h.profiles = { [ADMIN]: { is_admin: true }, [USER]: { is_admin: false }, [GONE]: { is_admin: true, deleted_at: '2026-01-01' } }
  h.tokens = { 'tok-admin': ADMIN, 'tok-user': USER, 'tok-gone': GONE }
  h.dbError = false
  h.run.mockReset()
  h.run.mockResolvedValue({ iin: IIN, entrepreneur: { state: 'none' }, enforcement: null })
})

describe('вход и админ-гейт', () => {
  it('без токена и с поддельным токеном - 401, проверка не запускается', async () => {
    expect((await GET(req('GET', null))).status).toBe(401)
    expect((await POST(req('POST', 'forged', { iin: IIN }))).status).toBe(401)
    expect((await POST(req('POST', null, { iin: IIN }))).status).toBe(401)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('обычному пользователю 403 admin_only и на чтение, и на проверку', async () => {
    const g = await GET(req('GET', 'tok-user'))
    expect(g.status).toBe(403)
    expect((await g.json()).error).toBe('admin_only')
    expect((await POST(req('POST', 'tok-user', { iin: IIN }))).status).toBe(403)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('удалённому аккаунту админа отказ', async () => {
    expect((await POST(req('POST', 'tok-gone', { iin: IIN }))).status).toBe(403)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('профиль не прочитался: 503, а не доступ', async () => {
    h.dbError = true
    expect((await POST(req('POST', 'tok-admin', { iin: IIN }))).status).toBe(503)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('админ: GET allowed', async () => {
    const g = await GET(req('GET', 'tok-admin'))
    expect(g.status).toBe(200)
    expect(await g.json()).toEqual({ allowed: true })
  })
})

describe('проверка', () => {
  it('ИИН с пробелами и дефисами нормализуется и проверяется', async () => {
    const r = await POST(req('POST', 'tok-admin', { iin: '9001 0130-0017' }))
    expect(r.status).toBe(200)
    expect(h.run).toHaveBeenCalledTimes(1)
    expect(h.run.mock.calls[0][1]).toBe(IIN)
    expect((await r.json()).result.iin).toBe(IIN)
  })

  it.each([
    ['БИН компании', '040340001997'],
    ['опечатка в контрольной цифре', '900101300018'],
    ['короткий', '9001013000'],
    ['пустой', ''],
  ])('%s: 400 invalid_iin, реестры не спрашиваются', async (_name, iin) => {
    const r = await POST(req('POST', 'tok-admin', { iin }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('invalid_iin')
    expect(h.run).not.toHaveBeenCalled()
  })

  it('тело не JSON: 400, а не падение', async () => {
    const bad = new NextRequest('http://localhost/api/person-check', {
      method: 'POST',
      headers: { authorization: 'Bearer tok-admin', 'content-type': 'application/json' },
      body: '{not json',
    })
    expect((await POST(bad)).status).toBe(400)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('ИИН берётся только из тела: нечисловое значение не проходит', async () => {
    expect((await POST(req('POST', 'tok-admin', { iin: 900101300017 }))).status).toBe(400)
    expect((await POST(req('POST', 'tok-admin', {}))).status).toBe(400)
  })
})
