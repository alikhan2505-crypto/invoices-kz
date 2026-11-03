import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  find: vi.fn(),
  send: vi.fn(),
  insert: vi.fn(),
  del: vi.fn(),
  update: vi.fn(),
}))

// daily_reports: insert (захват дня) / delete (снять при сбое отправки) / update (sent_at).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== 'daily_reports') throw new Error(`unexpected table ${table}`)
      const chain = (fn: (a: unknown[], b: unknown[]) => unknown) => ({
        eq: (...a: unknown[]) => ({ eq: (...b: unknown[]) => fn(a, b) }),
      })
      return {
        insert: h.insert,
        delete: () => chain(h.del),
        update: (patch: unknown) => chain((a, b) => h.update(patch, a, b)),
      }
    },
  }),
}))
vi.mock('@/lib/founderTelegram', () => ({ sendFounderTelegram: h.send }))
vi.mock('@/lib/paymentReconcile', async () => {
  const actual = await vi.importActual<typeof import('@/lib/paymentReconcile')>('@/lib/paymentReconcile')
  return { ...actual, findUnappliedPayments: h.find }
})

import { GET, maxDuration } from './route'

const SECRET = 'test-cron-secret-123456'
const call = (auth: string | null, qs = '') =>
  GET(new Request(`http://localhost/api/cron/payment-reconcile${qs}`, { headers: auth ? { authorization: auth } : {} }))

const finding = { kind: 'plan', id: 'pay1', userId: 'u1', amount: 5990, at: '2026-11-02T10:00:00.000Z', detail: 'оплачен тариф pro (месяц)' }
const clean = { findings: [], errors: [], checked: 7 }

const TUESDAY = new Date('2026-11-03T06:20:00Z')
const MONDAY = new Date('2026-11-02T06:20:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TUESDAY)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.CRON_SECRET = SECRET
  h.find.mockResolvedValue(clean)
  h.send.mockResolvedValue({ ok: true })
  h.insert.mockResolvedValue({ error: null })
  h.del.mockResolvedValue({ error: null })
  h.update.mockResolvedValue({ error: null })
})

afterEach(() => { vi.useRealTimers() })

describe('GET /api/cron/payment-reconcile', () => {
  it('без секрета, с чужим и с «Bearer undefined» - 401, база не читается', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call('Bearer wrong-secret-value')).status).toBe(401)
    expect((await call('Bearer undefined')).status).toBe(401)
    expect(h.find).not.toHaveBeenCalled()
  })

  it('чисто (не понедельник) - ничего не отправляет и не захватывает день', async () => {
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, findings: 0, errors: 0, checked: 7 })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('чисто, но понедельник - одна строка «сверка жива» со своим захватом дня', async () => {
    vi.setSystemTime(MONDAY)
    const res = await call(`Bearer ${SECRET}`)
    expect(await res.json()).toEqual({ ok: true, sent: true, heartbeat: true, findings: 0, errors: 0, checked: 7 })
    expect(h.insert).toHaveBeenCalledWith({ day: '2026-11-02', kind: 'payment-reconcile-ok' })
    expect(h.send.mock.calls[0][0]).toContain('Сверка платежей работает')
    expect(h.send.mock.calls[0][0]).toContain('проверено платежей — 7')
  })

  it('понедельник и есть находка - уходит только отчёт о находке, без «сверка жива»', async () => {
    vi.setSystemTime(MONDAY)
    h.find.mockResolvedValue({ findings: [finding], errors: [], checked: 7 })
    await call(`Bearer ${SECRET}`)
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.send.mock.calls[0][0]).not.toContain('Сверка платежей работает')
    expect(h.insert).toHaveBeenCalledWith({ day: '2026-11-02', kind: 'payment-reconcile' })
  })

  it('есть находка - захватывает день, шлёт в Telegram, ставит sent_at', async () => {
    h.find.mockResolvedValue({ findings: [finding], errors: [], checked: 7 })
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sent: true, heartbeat: false, findings: 1, errors: 0, checked: 7 })
    expect(h.insert).toHaveBeenCalledWith({ day: '2026-11-03', kind: 'payment-reconcile' })
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.send.mock.calls[0][0]).toContain('Тариф оплачен, но не включён')
    expect(h.update).toHaveBeenCalledWith({ sent_at: expect.any(String) }, expect.anything(), expect.anything())
  })

  it('день уже захвачен (двойной запуск) - второй раз не шлёт', async () => {
    h.find.mockResolvedValue({ findings: [finding], errors: [], checked: 7 })
    h.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const res = await call(`Bearer ${SECRET}`)
    expect(await res.json()).toMatchObject({ ok: true, already: true })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('отправка не удалась - 502 и захват снят, чтобы повтор дошёл', async () => {
    h.find.mockResolvedValue({ findings: [finding], errors: [], checked: 7 })
    h.send.mockResolvedValue({ ok: false, reason: 'telegram 500' })
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(502)
    expect(h.del).toHaveBeenCalledTimes(1)
    expect(h.update).not.toHaveBeenCalled()
  })

  it('таблицы daily_reports нет - всё равно отправляет (отчёт важнее защиты от повтора)', async () => {
    h.find.mockResolvedValue({ findings: [finding], errors: [], checked: 7 })
    h.insert.mockResolvedValue({ error: { code: '42P01', message: 'relation "daily_reports" does not exist' } })
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.update).not.toHaveBeenCalled()
  })

  it('?dry=1 возвращает находки и текст, ничего не шлёт и не захватывает', async () => {
    h.find.mockResolvedValue({ findings: [finding], errors: [], checked: 7 })
    const res = await call(`Bearer ${SECRET}`, '?dry=1')
    const body = await res.json()
    expect(body).toMatchObject({ dry: true, findings: [finding], errors: [] })
    expect(body.text).toContain('pay1')
    expect(h.send).not.toHaveBeenCalled()
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('только сбой проверки - тоже сообщает, чтобы молчаливая поломка сверки была видна', async () => {
    h.find.mockResolvedValue({ findings: [], errors: ['profiles: boom'], checked: 0 })
    const res = await call(`Bearer ${SECRET}`)
    expect(await res.json()).toMatchObject({ ok: true, sent: true, findings: 0, errors: 1 })
    expect(h.send.mock.calls[0][0]).toContain('profiles: boom')
  })

  it('исключение при чтении - 500 с причиной, а не необработанный сбой', async () => {
    h.find.mockRejectedValue(new Error('db down'))
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'db down' })
  })

  it('maxDuration - числовой литерал: Next 16 не раскрывает импортированный идентификатор', async () => {
    expect(maxDuration).toBe(60)
    const fs = await import('fs')
    const src = fs.readFileSync('src/app/api/cron/payment-reconcile/route.ts', 'utf-8')
    expect(/^export const maxDuration = \d+\s*$/m.test(src)).toBe(true)
  })
})

describe('vercel.json', () => {
  it('сверка стоит раз в сутки позже kaspi-poll (часы разные: крон Hobby срабатывает в любую минуту часа)', async () => {
    const fs = await import('fs')
    const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf-8')) as { crons: Array<{ path: string; schedule: string }> }
    const poll = cfg.crons.find(c => c.path === '/api/cron/kaspi-poll')!
    const rec = cfg.crons.find(c => c.path === '/api/cron/payment-reconcile')!
    expect(rec).toBeTruthy()
    const hour = (c: { schedule: string }) => Number(c.schedule.split(' ')[1])
    expect(hour(rec)).toBeGreaterThan(hour(poll))
    expect(rec.schedule.split(' ').slice(2).join(' ')).toBe('* * *')
  })
})
