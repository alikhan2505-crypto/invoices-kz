import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  source: {} as Record<string, unknown>,
  inserted: null as Record<string, unknown> | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => ({ data: 'R-1', error: null }),
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        limit: async () => ({ data: [], error: null }),
        // загрузка оригиналов: цепочка заканчивается на .is(...)
        is: async () => ({ data: [h.source], error: null }),
        update: () => chain,
        or: () => chain,
        insert: (row: Record<string, unknown>) => {
          h.inserted = row
          return { select: () => ({ single: async () => ({ data: { public_token: 'tok' }, error: null }) }) }
        },
      }
      return chain
    },
  }),
}))
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({}) } } }))
vi.mock('@/lib/cronAuth', () => ({ isCronAuthorized: () => true }))
vi.mock('@/lib/plan', () => ({ getActivePlan: () => 'pro' }))
vi.mock('@/lib/recurringGuard', () => ({
  currentPeriodStart: () => new Date('2026-11-01T00:00:00Z'),
  shouldSkipRecurringOwner: () => false,
}))

import { GET } from './route'

const base = {
  id: 'inv1', user_id: 'u1', amount: 1000, client_name: 'Клиент', client_bin: null,
  client_email: null, client_address: null, services: [], note: null,
}

describe('GET /api/cron/recurring: налоговые поля копии', () => {
  beforeEach(() => { h.inserted = null })

  it('копия берёт КНП и режим НДС у оригинала, а не из текущего профиля', async () => {
    h.source = { ...base, knp: '859', vat_type: 'vat_0', profiles: { vat_type: 'vat_16' } }
    await GET(new Request('http://localhost/x'))
    expect(h.inserted?.knp).toBe('859')
    expect(h.inserted?.vat_type).toBe('vat_0')
  })

  it('старый оригинал без значений: КНП остаётся null, НДС берётся по профилю продавца', async () => {
    h.source = { ...base, knp: null, vat_type: null, profiles: { vat_type: 'vat_16' } }
    await GET(new Request('http://localhost/x'))
    expect(h.inserted?.knp).toBeNull()
    expect(h.inserted?.vat_type).toBe('vat_16')
  })

  it('до миграции (колонок нет в select *): knp -> null, НДС по профилю', async () => {
    h.source = { ...base, profiles: { vat_type: null } }
    await GET(new Request('http://localhost/x'))
    expect(h.inserted?.knp).toBeNull()
    expect(h.inserted?.vat_type).toBe('no_vat')
  })
})
