import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  selects: [] as { table: string; cols: string }[],
  rows: {} as Record<string, any>,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const b: any = {
        select(cols: string) { h.selects.push({ table, cols }); return b },
        eq() { return b },
        maybeSingle: async () => ({ data: h.rows[table] ?? null, error: null }),
        then: (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej),
      }
      return b
    },
  }),
}))

import { NextRequest } from 'next/server'
import { GET } from './route'

const call = () => GET(new NextRequest('http://localhost/api/public/contract/tok'), { params: Promise.resolve({ token: 'tok' }) })

beforeEach(() => {
  h.selects = []
  h.rows = {
    contracts: { id: 'c1', title: 'Договор', created_at: '2026-10-01', user_id: 'u1' },
    profiles: { company_name: 'ТОО Продавец' },
  }
})

describe('GET /api/public/contract/[token]', () => {
  it('uses explicit columns and does not return user_id or file_url', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    for (const s of h.selects) expect(s.cols).not.toContain('*')
    const body = await res.json()
    expect(body.contract).toEqual({ id: 'c1', title: 'Договор', created_at: '2026-10-01' })
    expect(JSON.stringify(body)).not.toMatch(/user_id|file_url/)
    expect(body.profile).toEqual({ company_name: 'ТОО Продавец' })
    expect(body.signatures).toEqual([])
  })
})
