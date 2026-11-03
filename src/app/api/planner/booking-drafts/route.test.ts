import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Подтверждение черновика записи в планировщике: кривое тело - 400, а внутренний
// текст сбоя (SQL базы, ответ канала) не уходит в ответ (аудит 02.11.2026, раздел 4).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})
const h = vi.hoisted(() => ({
  confirm: vi.fn(),
  session: { siteId: 'site1', ownerProfileId: 'o1' } as unknown,
  draft: { id: 'd1', site_id: 'site1', status: 'pending_approval' } as { id: string; site_id: string; status: string } | null,
  rejectError: null as { message: string } | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from() {
      const b: any = {
        select: () => b,
        eq: () => b,
        in: () => b,
        update: () => b,
        single: async () => ({ data: h.draft, error: null }),
        // await на update().eq().in(): отклонение черновика.
        then: (res: any, rej: any) => Promise.resolve({ error: h.rejectError }).then(res, rej),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/plannerAuth', () => ({ requirePlannerSession: async () => h.session }))
vi.mock('@/lib/aiAgent/bookingSend', () => ({ confirmBookingDraft: h.confirm }))

import { POST } from './route'

const post = (raw: string) => POST(new NextRequest('http://localhost/api/planner/booking-drafts', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
}))

beforeEach(() => {
  h.confirm.mockReset()
  h.confirm.mockResolvedValue({ ok: true, bookingId: 'b1' })
  h.session = { siteId: 'site1', ownerProfileId: 'o1' }
  h.draft = { id: 'd1', site_id: 'site1', status: 'pending_approval' }
  h.rejectError = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/planner/booking-drafts', () => {
  it('кривое тело (не JSON, пустое, не объект, поля не тех типов): 400, подтверждения нет', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '{"draftId":123,"action":"approve"}', '{"draftId":"d1","action":"drop"}', '{"draftId":"d1"}']) {
      expect((await post(raw)).status, raw).toBe(400)
    }
    expect(h.confirm).not.toHaveBeenCalled()
  })

  it('подтверждение работает как раньше', async () => {
    const res = await post(JSON.stringify({ draftId: 'd1', action: 'approve' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, status: 'confirmed' })
  })

  it('чужой черновик: 404, подтверждения нет', async () => {
    h.draft = { id: 'd1', site_id: 'other-site', status: 'pending_approval' }
    expect((await post(JSON.stringify({ draftId: 'd1', action: 'approve' }))).status).toBe(404)
    expect(h.confirm).not.toHaveBeenCalled()
  })

  it('внутренний сбой подтверждения: 502 с общим текстом, SQL и имена таблиц наружу не уходят, детали в логе', async () => {
    h.confirm.mockResolvedValue({ ok: false, error: 'создание брони: duplicate key value violates unique constraint "salon_bookings_master_slot_key"' })
    const res = await post(JSON.stringify({ draftId: 'd1', action: 'approve' }))
    expect(res.status).toBe(502)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось подтвердить запись"}')
    expect(text).not.toContain('salon_bookings')
    expect(text).not.toContain('constraint')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('planner booking-drafts'), expect.stringContaining('salon_bookings_master_slot_key'))
  })

  it('параллельное подтверждение: 409 с прежним текстом', async () => {
    h.confirm.mockResolvedValue({ ok: false, error: 'draft already claimed' })
    const res = await post(JSON.stringify({ draftId: 'd1', action: 'approve' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Черновик уже обрабатывается' })
  })

  it('сбой отклонения: 502 без текста ошибки базы', async () => {
    h.rejectError = { message: 'permission denied for table ai_agent_booking_drafts' }
    const res = await post(JSON.stringify({ draftId: 'd1', action: 'reject' }))
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('ai_agent_booking_drafts')
  })
})
