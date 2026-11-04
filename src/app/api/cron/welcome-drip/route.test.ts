import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Крон welcome-цепочки на базе в памяти: какое письмо «через сутки» уходит
// (шаг 5 без реквизитов или банка, иначе шаг 4) и что два письма-альтернативы
// не уходят оба, даже если параллельный прогон успел взять другое (04.11.2026).

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  db: { profiles: [] as Row[], drips: [] as Row[], banks: [] as Row[] },
  bankError: null as null | { message: string },
  // Строка, которую «параллельный прогон» вставит сразу после того, как наш прогон прочитал email_drips.
  rivalAfterSnapshot: null as null | Row,
  send: vi.fn(),
}))

function table(name: 'profiles' | 'email_drips' | 'bank_accounts') {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'delete' = 'select'
  let payload: Row | null = null
  const rows = () => (name === 'profiles' ? h.db.profiles : name === 'email_drips' ? h.db.drips : h.db.banks)
  const exec = () => {
    if (op === 'insert') {
      const r = payload!
      if (h.db.drips.some(d => d.user_id === r.user_id && d.step === r.step)) return { data: null, error: { code: '23505', message: 'dup' } }
      h.db.drips.push({ ...r, sent_at: new Date().toISOString() })
      return { data: null, error: null }
    }
    if (op === 'delete') {
      h.db.drips = h.db.drips.filter(r => !filters.every(f => f(r)))
      return { data: null, error: null }
    }
    if (name === 'bank_accounts' && h.bankError) return { data: null, error: h.bankError }
    const data = rows().filter(r => filters.every(f => f(r))).map(r => ({ ...r }))
    if (name === 'email_drips' && h.rivalAfterSnapshot) { h.db.drips.push(h.rivalAfterSnapshot); h.rivalAfterSnapshot = null }
    return { data, error: null }
  }
  const b = {
    select: () => b,
    gte: () => b,
    is: () => b,
    not: () => b,
    eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return b },
    in: (col: string, vals: unknown[]) => { filters.push(r => vals.includes(r[col])); return b },
    insert: (row: Row) => { op = 'insert'; payload = row; return b },
    delete: () => { op = 'delete'; return b },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (name: 'profiles' | 'email_drips' | 'bank_accounts') => table(name),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com`, email_confirmed_at: '2026-11-09T06:05:00Z' } }, error: null }) } },
  }),
}))
vi.mock('resend', () => ({ Resend: class { emails = { send: h.send } } }))

import { GET } from './route'

const SECRET = 'test-cron-secret-123456'
const call = () => GET(new Request('http://localhost/api/cron/welcome-drip', { headers: { authorization: `Bearer ${SECRET}` } }))
// Регистрация после SETUP_LAUNCH; «сейчас» — через 1,25 суток, приветствие давно ушло.
const NOW = new Date('2026-11-10T12:00:00Z')
const user = (id: string, extra: Row = {}) => ({
  id, email: `${id}@example.com`, created_at: '2026-11-09T06:00:00', trial_expires_at: null,
  company_name: null, bin_iin: null, email_optout: false, ...extra,
})
const welcomeSent = (id: string) => ({ user_id: id, step: 1, sent_at: '2026-11-09T06:15:00' })
const sentSubjects = () => h.send.mock.calls.map(c => (c[0] as { subject: string }).subject)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  process.env.CRON_SECRET = SECRET
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
  h.db = { profiles: [], drips: [], banks: [] }
  h.bankError = null
  h.rivalAfterSnapshot = null
  h.send.mockReset()
  h.send.mockResolvedValue({ data: { id: 'e1' }, error: null })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('GET /api/cron/welcome-drip — письмо «через сутки»', () => {
  it('без реквизитов и банка уходит шаг 5, с готовым кабинетом — шаг 4', async () => {
    h.db.profiles = [user('empty'), user('ready', { company_name: 'ТОО Ромашка', bin_iin: '050140008166' })]
    h.db.drips = [welcomeSent('empty'), welcomeSent('ready')]
    h.db.banks = [{ user_id: 'ready' }]
    const res = await call()
    expect(await res.json()).toEqual({ success: true, sent: 2, skipped: 0 })
    const byTo = Object.fromEntries(h.send.mock.calls.map(c => [(c[0] as { to: string }).to, (c[0] as { subject: string }).subject]))
    expect(byTo['empty@example.com']).toBe('До первого счёта осталась минута')
    expect(byTo['ready@example.com']).toBe('Что ещё умеет invoices.kz')
    expect(h.db.drips.filter(d => d.step === 5).map(d => d.user_id)).toEqual(['empty'])
    expect(h.db.drips.filter(d => d.step === 4).map(d => d.user_id)).toEqual(['ready'])
  })

  it('реквизиты есть, банка нет — тоже шаг 5', async () => {
    h.db.profiles = [user('nobank', { company_name: 'ТОО Ромашка', bin_iin: '050140008166' })]
    h.db.drips = [welcomeSent('nobank')]
    await call()
    expect(sentSubjects()).toEqual(['До первого счёта осталась минута'])
  })

  it('не удалось прочитать банки — состояние неизвестно, уходит прежнее письмо 4', async () => {
    h.db.profiles = [user('empty')]
    h.db.drips = [welcomeSent('empty')]
    h.bankError = { message: 'timeout' }
    await call()
    expect(sentSubjects()).toEqual(['Что ещё умеет invoices.kz'])
  })

  it('параллельный прогон уже взял шаг 4 — наш claim шага 5 снимается, письмо не уходит', async () => {
    h.db.profiles = [user('empty')]
    h.db.drips = [welcomeSent('empty')]
    h.rivalAfterSnapshot = { user_id: 'empty', step: 4, sent_at: NOW.toISOString() }
    const res = await call()
    expect(h.send).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1 })
    expect(h.db.drips.some(d => d.step === 5)).toBe(false)
    expect(h.db.drips.some(d => d.step === 4)).toBe(true)
  })

  it('после шага 5 шаг 4 не уходит, даже когда кабинет уже заполнен', async () => {
    h.db.profiles = [user('filled', { company_name: 'ТОО Ромашка', bin_iin: '050140008166' })]
    h.db.drips = [welcomeSent('filled'), { user_id: 'filled', step: 5, sent_at: '2026-11-09T05:30:00' }]
    h.db.banks = [{ user_id: 'filled' }]
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    await call()
    expect(h.send).not.toHaveBeenCalled()
  })

  it('ошибка Resend снимает claim, чтобы завтра попробовать снова', async () => {
    h.db.profiles = [user('empty')]
    h.db.drips = [welcomeSent('empty')]
    h.send.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await call()
    expect(h.db.drips.some(d => d.step === 5)).toBe(false)
  })
})
