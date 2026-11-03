import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  profile: { data: { vat_type: 'vat_16' } as { vat_type: string | null } | null, error: null as unknown },
  inserted: null as Record<string, unknown> | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => ({ data: 'W-1', error: null }),
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => h.profile }) }) }
      }
      return {
        insert: (row: Record<string, unknown>) => {
          h.inserted = row
          return { select: () => ({ single: async () => ({ data: { public_token: 'tok' }, error: null }) }) }
        },
      }
    },
  }),
}))
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({}) } } }))
vi.mock('@/lib/kaspiShop/storefront', () => ({
  resolveStorefrontBySlug: async () => ({ connectionId: 'c1', userId: 'u1', companyName: 'Shop' }),
}))
vi.mock('@/lib/kaspiShop/wholesaleStorefront', () => ({
  loadWholesaleModelByVariant: async () => ({ model: {}, variant: {} }),
  resolveWholesaleLine: (_m: unknown, _v: unknown, qty: number) => ({ name: 'Куртка', price: 1000, qty }),
}))

import { POST } from './route'

const call = () => POST(
  new NextRequest('http://localhost/x', {
    method: 'POST',
    body: JSON.stringify({
      clientName: 'ТОО Клиент', clientBin: '123456789012', clientEmail: 'a@b.kz',
      items: [{ modelId: 'm', size: 'M', color: 'red', qty: 2 }],
    }),
  }),
  { params: Promise.resolve({ slug: 's' }) },
)

describe('POST /api/shop/[slug]/wholesale-order: налоговые поля счёта', () => {
  beforeEach(() => { h.inserted = null; h.profile = { data: { vat_type: 'vat_16' }, error: null } })

  it('режим НДС продавца записывается в счёт, КНП не задаётся (null => 849)', async () => {
    expect((await call()).status).toBe(200)
    expect(h.inserted?.vat_type).toBe('vat_16')
    expect(h.inserted).not.toHaveProperty('knp')
  })

  it('у продавца режим не задан: no_vat; профиль не прочитался: null (просмотр возьмёт режим профиля)', async () => {
    h.profile = { data: { vat_type: null }, error: null }
    await call()
    expect(h.inserted?.vat_type).toBe('no_vat')
    h.profile = { data: null, error: null }
    await call()
    expect(h.inserted?.vat_type).toBeNull()
  })
})
