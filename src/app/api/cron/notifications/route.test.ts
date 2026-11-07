import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeSecDb, type SecDb } from '@/lib/kaspiShop/secDb.testkit'

const { state, sendTelegram, createNotification, formatDigest } = vi.hoisted(() => ({
  state: { db: null as unknown as SecDb },
  sendTelegram: vi.fn(async (_chat: string, _text: string) => true),
  createNotification: vi.fn(async () => {}),
  formatDigest: vi.fn((): string | null => null),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => state.db.client.from(t) }) }))
vi.mock('resend', () => ({ Resend: class { emails = { send: vi.fn(async () => ({})) } } }))
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: sendTelegram }))
vi.mock('@/lib/notifications', () => ({ createNotification }))
vi.mock('@/lib/welcomeDrip', () => ({ makeRecipientResolver: () => async () => 'owner@example.kz' }))
vi.mock('@/lib/kaspiShop/dailyDigest', () => ({
  loadDigestData: vi.fn(async () => ({})),
  formatDigest,
}))

import { GET } from './route'
import { windowKey, WINDOW_SENTINEL_DAY } from '@/lib/windowLimits'
import { SESSION_NOTICE_EPISODE_PREFIX, SESSION_NOTICE_MAX_PER_EPISODE, __resetSessionNoticeCacheForTests } from '@/lib/kaspiShop/sessionExpiredNotice'
import { __resetPrefsColumnCacheForTests } from '@/lib/notificationPrefsServer'
import { COUNTER_TABLE } from '@/lib/toolQuota'

const owner = {
  id: 'u1', is_admin: true, email: 'o@example.kz', telegram_chat_id: '42', notify_telegram: true, deleted_at: null,
}
const expiredConn = { id: 'c1', user_id: 'u1', company_name: 'Shop One', session_status: 'session_expired' }

function request() {
  return new Request('http://localhost/api/cron/notifications', { headers: { authorization: `Bearer ${'s'.repeat(64)}` } })
}
const messages = () => sendTelegram.mock.calls.map(c => c[1])

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // 2026-11-07 -- суббота: недельный отчёт (понедельник) не запускается.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 7, 4, 10)))
  process.env.CRON_SECRET = 's'.repeat(64)
  __resetSessionNoticeCacheForTests()
  __resetPrefsColumnCacheForTests()
  formatDigest.mockReturnValue(null)
  state.db = makeSecDb({ profiles: [{ ...owner }], kaspi_shop_connections: [{ ...expiredConn }] })
})
afterEach(() => { vi.useRealTimers() })

describe('GET /api/cron/notifications: dead Kaspi session (K45)', () => {
  it('tells a Pro seller about the dead session once (Telegram + bell), even on a quiet digest day', async () => {
    const res = await GET(request())
    const body = await res.json()
    expect(body.sessionNotices).toBe(1)
    expect(messages()).toHaveLength(1)
    expect(messages()[0]).toContain('сессия кабинета истекла')
    expect(messages()[0]).toContain('Shop One')
    expect(createNotification).toHaveBeenCalledWith('u1', expect.stringContaining('Kaspi'), expect.any(String), '/kaspi-shop')
  })

  it('does not repeat the dead-session line in the digest that goes out right after the notice', async () => {
    formatDigest.mockReturnValue('🤖 Демпинг — изменено цен: <b>3</b>')
    await GET(request())
    expect(messages()).toHaveLength(2)
    expect(messages()[1]).toContain('Демпинг')
    expect(messages()[1]).not.toContain('Сессия кабинета Kaspi истекла')
  })

  it('a second run the same day sends no new notice, but a non-quiet digest still mentions the dead session', async () => {
    await GET(request())
    sendTelegram.mockClear()
    formatDigest.mockReturnValue('🤖 Демпинг — изменено цен: <b>3</b>')
    const body = await (await GET(request())).json()
    expect(body.sessionNotices).toBe(0)
    expect(messages()).toHaveLength(1)
    expect(messages()[0]).toContain('Демпинг')
    expect(messages()[0]).toContain('Сессия кабинета Kaspi истекла')
    expect(messages()[0]).toContain('«Shop One»')
  })

  it('a quiet digest day stays silent once the per-outage allowance is used up (abandoned store, no endless daily message)', async () => {
    state.db.tables[COUNTER_TABLE] = [{
      key: windowKey(SESSION_NOTICE_EPISODE_PREFIX, 'u1', 'episode'), day: WINDOW_SENTINEL_DAY, count: SESSION_NOTICE_MAX_PER_EPISODE,
    }]
    const body = await (await GET(request())).json()
    expect(body.sessionNotices).toBe(0)
    expect(messages()).toHaveLength(0)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('a seller who switched the notice off but keeps the digest gets the dead-session line in the digest', async () => {
    state.db.tables.profiles = [{ ...owner, notification_prefs: { kaspi_session_expired: { telegram: false } } }]
    const body = await (await GET(request())).json()
    // Колокольчик остаётся, Telegram-уведомления нет...
    expect(body.sessionNotices).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(1)
    // ...а сводка, на которую он подписан, одной строкой сообщает об обрыве.
    expect(messages()).toHaveLength(1)
    expect(messages()[0]).toContain('Сессия кабинета Kaspi истекла')
  })

  it('a seller whose Pro has ended gets neither the notice nor the digest line', async () => {
    state.db.tables.profiles = [{ ...owner, is_admin: false, plan: 'free' }]
    const body = await (await GET(request())).json()
    expect(body.sessionNotices).toBe(0)
    expect(messages()).toHaveLength(0)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('a deleted account gets nothing', async () => {
    state.db.tables.profiles = [{ ...owner, deleted_at: '2026-11-01T00:00:00Z' }]
    await GET(request())
    expect(messages()).toHaveLength(0)
  })

  it('names all dead stores of one seller in ONE message', async () => {
    state.db.tables.kaspi_shop_connections = [
      { ...expiredConn },
      { id: 'c2', user_id: 'u1', company_name: 'Shop Two', session_status: 'session_expired' },
      { id: 'c3', user_id: 'u1', company_name: 'Healthy', session_status: 'active' },
    ]
    await GET(request())
    expect(messages()).toHaveLength(1)
    expect(messages()[0]).toContain('Shop One')
    expect(messages()[0]).toContain('Shop Two')
    expect(messages()[0]).not.toContain('Healthy')
  })

  it('nothing is sent when every session is alive', async () => {
    state.db.tables.kaspi_shop_connections = [{ ...expiredConn, session_status: 'active' }]
    const body = await (await GET(request())).json()
    expect(body.sessionNotices).toBe(0)
    expect(messages()).toHaveLength(0)
  })

  it('still rejects an unauthorized caller', async () => {
    const res = await GET(new Request('http://localhost/api/cron/notifications'))
    expect(res.status).toBe(401)
  })
})
