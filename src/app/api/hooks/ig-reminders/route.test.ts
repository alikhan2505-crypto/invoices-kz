import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ runs: 0 }))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/instagram', () => ({ sendInstagramTextMessage: async () => {} }))
vi.mock('@/lib/aiAgent/planGate', () => ({ agentCanReply: async () => true }))
vi.mock('@/lib/aiAgent/webhookHandler', () => ({
  loadTenantConnectionByAgentId: async () => null,
  markTokenExpiredIfUnauthorized: async () => {},
}))
vi.mock('@/lib/aiAgent/dmReminderStore', () => ({ createReminderStore: () => ({}) }))
vi.mock('@/lib/aiAgent/dmReminder', () => ({
  attributionReady: async () => true,
  runDmReminders: async () => { h.runs++; return { scanned: 0, sent: 0, failed: 0, capped: 0, waiting: 0, skipped: {} } },
}))

import { NextRequest } from 'next/server'
import { POST, maxDuration } from './route'
import { resetThrottle } from '@/lib/hooksGuard'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/hooks/ig-reminders', { method: 'POST', headers, body: '{}' })

beforeEach(() => { h.runs = 0; resetThrottle(); delete process.env.IG_REMINDER_CRON_SECRET; vi.spyOn(console, 'log').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

describe('/api/hooks/ig-reminders: потолок длительности', () => {
  it('maxDuration задан явно (отправки последовательные, до 20 с каждая)', () => {
    expect(maxDuration).toBe(60)
  })
})

describe('/api/hooks/ig-reminders: защита', () => {
  it('секрет в окружении не задан -- всегда 401 (закрыто по умолчанию), крон не запускается', async () => {
    expect((await POST(req())).status).toBe(401)
    expect((await POST(req({ 'x-internal-secret': '' }))).status).toBe(401)
    expect(h.runs).toBe(0)
  })

  it('секрет задан: без заголовка или с чужим -- 401', async () => {
    process.env.IG_REMINDER_CRON_SECRET = 's3cret-value'
    expect((await POST(req())).status).toBe(401)
    expect((await POST(req({ 'x-internal-secret': 'wrong' }))).status).toBe(401)
    expect(h.runs).toBe(0)
  })

  it('верный секрет -- запуск и только счётчики в ответе', async () => {
    process.env.IG_REMINDER_CRON_SECRET = 's3cret-value'
    const res = await POST(req({ 'x-internal-secret': 's3cret-value' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, scanned: 0, sent: 0, failed: 0, capped: 0, waiting: 0, skipped: {} })
    expect(h.runs).toBe(1)
  })

  it('частые вызовы: второй в ту же минуту пропускается', async () => {
    process.env.IG_REMINDER_CRON_SECRET = 's3cret-value'
    await POST(req({ 'x-internal-secret': 's3cret-value' }))
    const res = await POST(req({ 'x-internal-secret': 's3cret-value' }))
    expect((await res.json()).throttled).toBe(true)
    expect(h.runs).toBe(1)
  })
})
