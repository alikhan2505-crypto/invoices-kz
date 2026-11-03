import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  profile: { data: { vat_type: 'vat_16' } as { vat_type: string | null } | null },
  inserted: null as Record<string, unknown> | null,
}))

vi.mock('./channelSend', () => ({ sendIntoConversation: async () => null }))
vi.mock('./catalogContext', () => ({ loadAgentCatalog: async () => [], storePinFor: () => null }))
vi.mock('./productPhoto', () => ({ pickProductPhoto: () => null }))
vi.mock('@/lib/notifications', () => ({ createNotification: async () => {} }))
vi.mock('@/lib/notificationPrefsServer', () => ({ loadNotifyProfile: async () => null }))
vi.mock('@/lib/notificationPrefs', () => ({ preferenceFor: () => true }))

import { sendInvoiceForDraft } from './invoiceSend'

const draft = {
  id: 'd1', agent_id: 'a1', conversation_id: 'c1', invoice_id: null,
  customer_name: 'Айгерим', customer_phone: '+77001112233', total: 2000,
  items: [{ name: 'Товар', qty: 2, unitPrice: 1000 }],
}

function fakeSupabase() {
  const rows: Record<string, unknown> = {
    ai_agent_invoice_drafts: draft,
    ai_agents: { id: 'a1', user_id: 'u1' },
    ai_agent_conversations: { id: 'c1', channel: 'whatsapp', external_thread_id: 't', agent_id: 'a1' },
  }
  return {
    rpc: async () => ({ data: 'N-1', error: null }),
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => h.profile }) }) }
      }
      if (table === 'invoices') {
        return {
          insert: (row: Record<string, unknown>) => {
            h.inserted = row
            return { select: () => ({ single: async () => ({ data: { id: 'i1', number: 'N-1', public_token: 'tok' }, error: null }) }) }
          },
        }
      }
      const chain: any = {
        select: () => chain,
        // захват черновика: update().eq().in().select() -> массив
        update: () => chain,
        eq: () => chain,
        in: () => chain,
        single: async () => ({ data: rows[table], error: null }),
        then: (res: (v: unknown) => void) => res({ data: [{ id: 'd1' }], error: null }),
      }
      return chain
    },
  } as any
}

describe('sendInvoiceForDraft: налоговые поля счёта из чата', () => {
  beforeEach(() => { h.inserted = null; h.profile = { data: { vat_type: 'vat_16' } } })

  it('режим НДС продавца записывается в счёт, КНП не задаётся (null => 849)', async () => {
    const r = await sendInvoiceForDraft(fakeSupabase(), 'd1', { auto: true })
    expect(r.ok).toBe(true)
    expect(h.inserted?.vat_type).toBe('vat_16')
    expect(h.inserted).not.toHaveProperty('knp')
  })

  it('режим у продавца не задан: no_vat; профиль не прочитался: null', async () => {
    h.profile = { data: { vat_type: null } }
    await sendInvoiceForDraft(fakeSupabase(), 'd1', { auto: true })
    expect(h.inserted?.vat_type).toBe('no_vat')
    h.profile = { data: null }
    await sendInvoiceForDraft(fakeSupabase(), 'd1', { auto: true })
    expect(h.inserted?.vat_type).toBeNull()
  })
})
