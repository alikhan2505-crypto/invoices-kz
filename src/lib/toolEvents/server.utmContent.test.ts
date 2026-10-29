import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ inserts: [] as any[], failWithMissingColumn: false }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      insert: async (row: any) => {
        h.inserts.push(row)
        if (h.failWithMissingColumn && 'utm_content' in row) return { error: { code: '42703', message: 'column "utm_content" does not exist' } }
        return { error: null }
      },
    }),
  }),
}))

import { NextRequest } from 'next/server'
import { handleToolEvent } from './server'

const req = (utm: any) => new NextRequest('http://localhost/api/tools/event', {
  method: 'POST',
  headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Safari', 'x-forwarded-for': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  body: JSON.stringify({ event: 'view', tool: 'kontragent', utm }),
})

beforeEach(() => { h.inserts = []; h.failWithMissingColumn = false; vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('POST /api/tools/event с utm_content', () => {
  it('токен пишется в utm_content', async () => {
    expect((await handleToolEvent(req({ source: 'dm', content: 'AbCdEf0123456789' }))).status).toBe(204)
    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0]).toMatchObject({ utm_source: 'dm', utm_content: 'AbCdEf0123456789' })
  })

  it('события без токена вставляются без ключа utm_content (работает и до миграции)', async () => {
    h.failWithMissingColumn = true
    await handleToolEvent(req({ source: 'dm' }))
    expect(h.inserts).toHaveLength(1)
    expect('utm_content' in h.inserts[0]).toBe(false)
  })

  it('колонки нет (миграция не применена): событие не теряется, пишется без токена', async () => {
    h.failWithMissingColumn = true
    expect((await handleToolEvent(req({ source: 'dm', content: 'AbCdEf0123456789' }))).status).toBe(204)
    expect(h.inserts).toHaveLength(2)
    expect('utm_content' in h.inserts[1]).toBe(false)
    expect(h.inserts[1]).toMatchObject({ event: 'view', tool: 'kontragent', utm_source: 'dm' })
  })
})
