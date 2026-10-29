import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('resend', () => ({ Resend: class { emails = { send: vi.fn() } } }))
vi.mock('@/lib/binWatch/run', () => ({ runBinWatch: h.run }))

import { GET, maxDuration } from './route'
import { BIN_WATCH_EMAIL_DEADLINE_MS, BIN_WATCH_LOOKUP_DEADLINE_MS, BIN_WATCH_MAX_DURATION_S } from '@/lib/binWatch/config'

const SECRET = 'test-cron-secret-123456'
const call = (auth: string | null) =>
  GET(new Request('http://localhost/api/cron/bin-watch', { headers: auth ? { authorization: auth } : {} }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  process.env.CRON_SECRET = SECRET
  process.env.RESEND_API_KEY = 're_test'
})

describe('GET /api/cron/bin-watch', () => {
  it('без секрета, с чужим секретом и с «Bearer undefined» - 401, прогон не стартует', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call('Bearer wrong-secret-value')).status).toBe(401)
    expect((await call('Bearer undefined')).status).toBe(401)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('если CRON_SECRET не задан в окружении, закрыто для всех', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer undefined')).status).toBe(401)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('с верным секретом запускает прогон и отдаёт только счётчики', async () => {
    h.run.mockResolvedValue({ ok: true, checked: 3, mailsSent: 1 })
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, checked: 3, mailsSent: 1 })
  })

  it('таблицы ещё нет - штатный 200, не сбой крона', async () => {
    h.run.mockResolvedValue({ ok: false, reason: 'table_missing' })
    expect((await call(`Bearer ${SECRET}`)).status).toBe(200)
  })

  it('настоящий сбой - 502, чтобы Vercel показал крон упавшим', async () => {
    h.run.mockResolvedValue({ ok: false, reason: 'read_failed' })
    expect((await call(`Bearer ${SECRET}`)).status).toBe(502)
  })

  it('maxDuration задан явно и совпадает с бюджетом времени', () => {
    expect(maxDuration).toBe(300)
    expect(maxDuration).toBe(BIN_WATCH_MAX_DURATION_S)
    // Дедлайны проверок и писем укладываются в функцию с запасом.
    expect(BIN_WATCH_LOOKUP_DEADLINE_MS).toBeLessThan(BIN_WATCH_EMAIL_DEADLINE_MS)
    expect(BIN_WATCH_EMAIL_DEADLINE_MS).toBeLessThan(BIN_WATCH_MAX_DURATION_S * 1000)
  })

  it('maxDuration в route.ts - числовой литерал: Next 16 не раскрывает импортированный идентификатор и валит build', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync('src/app/api/cron/bin-watch/route.ts', 'utf-8')
    const m = /^export const maxDuration = (\S+)\s*$/m.exec(src)
    expect(m).not.toBeNull()
    expect(m![1]).toMatch(/^\d+$/)
  })
})

describe('vercel.json', () => {
  it('крон зарегистрирован раз в сутки после выгрузки реабилитации (02:00 UTC)', async () => {
    const fs = await import('fs')
    const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf-8')) as { crons: Array<{ path: string; schedule: string }> }
    const rehab = cfg.crons.find(c => c.path === '/api/cron/kgd-rehabilitation')!
    const watch = cfg.crons.find(c => c.path === '/api/cron/bin-watch')!
    expect(watch).toBeTruthy()
    expect(watch.schedule).toBe('30 2 * * *')
    expect(rehab.schedule).toBe('0 2 * * *')
  })
})
