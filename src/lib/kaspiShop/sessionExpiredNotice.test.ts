import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSecDb } from './secDb.testkit'
import { COUNTER_TABLE } from '@/lib/toolQuota'

const { sendTelegram, createNotification } = vi.hoisted(() => ({
  sendTelegram: vi.fn(async () => true),
  createNotification: vi.fn(async () => {}),
}))
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: sendTelegram }))
vi.mock('@/lib/notifications', () => ({ createNotification }))

import {
  notifySessionExpired, resetSessionExpiredNotices, formatSessionExpiredText, formatSessionExpiredDigestLine,
  SESSION_NOTICE_MAX_PER_EPISODE, __resetSessionNoticeCacheForTests,
} from './sessionExpiredNotice'
import { __resetPrefsColumnCacheForTests } from '@/lib/notificationPrefsServer'
import { wantsNotification, getNotificationEvent, resolveAllPrefs } from '@/lib/notificationPrefs'

const DAY = 24 * 3_600_000
const T0 = Date.UTC(2026, 10, 7, 4, 0)
const proOwner = { id: 'u1', is_admin: true, email: 'a@b.kz', telegram_chat_id: '42', notify_telegram: true, deleted_at: null }

function setup(profile: Record<string, any> | null = proOwner) {
  const db = makeSecDb({ profiles: profile ? [{ ...profile }] : [] })
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  __resetSessionNoticeCacheForTests()
  __resetPrefsColumnCacheForTests()
})

describe('kaspi_session_expired preference', () => {
  it('is a Kaspi owner event on telegram + bell, only telegram toggleable', () => {
    const e = getNotificationEvent('kaspi_session_expired')!
    expect(e.audience).toBe('owner')
    expect(e.group).toBe('kaspiShop')
    expect(e.channels.sort()).toEqual(['bell', 'telegram'])
    expect(e.toggleable).toEqual(['telegram'])
  })

  it('follows the Telegram master by default and an explicit toggle beats it', () => {
    const p = { telegram_chat_id: '1', notify_telegram: true }
    expect(wantsNotification(p, 'kaspi_session_expired', 'telegram')).toBe(true)
    expect(wantsNotification({ ...p, notify_telegram: false }, 'kaspi_session_expired', 'telegram')).toBe(false)
    expect(wantsNotification({ ...p, notification_prefs: { kaspi_session_expired: { telegram: false } } }, 'kaspi_session_expired', 'telegram')).toBe(false)
    expect(resolveAllPrefs(p).kaspi_session_expired).toEqual({ telegram: true, bell: true })
  })
})

describe('notifySessionExpired', () => {
  it('sends Telegram + bell to a Pro seller who wants it', async () => {
    const db = setup()
    const res = await notifySessionExpired(db.client, 'u1', ['Мой магазин'], { now: T0 })
    expect(res).toEqual({ status: 'sent', telegram: true })
    expect(sendTelegram).toHaveBeenCalledTimes(1)
    const [chat, text] = sendTelegram.mock.calls[0] as unknown as [string, string]
    expect(chat).toBe('42')
    expect(text).toContain('сессия кабинета истекла')
    expect(text).toContain('«Мой магазин»')
    expect(createNotification).toHaveBeenCalledWith('u1', expect.stringContaining('Kaspi'), expect.any(String), '/kaspi-shop')
  })

  it('once per day: a second call the same day (any path) sends nothing, even with a cold cache', async () => {
    const db = setup()
    await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 })
    // Другой экземпляр функции: кэша в памяти нет, держит только счётчик в базе.
    __resetSessionNoticeCacheForTests()
    const again = await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + 3_600_000 })
    expect(again.status).toBe('duplicate')
    expect(sendTelegram).toHaveBeenCalledTimes(1)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('parallel detections the same moment cannot double-send', async () => {
    const db = setup()
    const results = await Promise.all(Array.from({ length: 6 }, () => notifySessionExpired(db.client, 'u1', ['A'], { now: T0 })))
    expect(results.filter(r => r.status === 'sent')).toHaveLength(1)
    expect(sendTelegram).toHaveBeenCalledTimes(1)
  })

  it(`sends again the next day but at most ${SESSION_NOTICE_MAX_PER_EPISODE} times per outage`, async () => {
    const db = setup()
    const statuses: string[] = []
    for (let d = 0; d < SESSION_NOTICE_MAX_PER_EPISODE + 2; d++) {
      __resetSessionNoticeCacheForTests()
      statuses.push((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + d * DAY })).status)
    }
    expect(statuses).toEqual(['sent', 'sent', 'sent', 'capped', 'capped'])
    expect(sendTelegram).toHaveBeenCalledTimes(SESSION_NOTICE_MAX_PER_EPISODE)
  })

  it('a reconnect starts a new outage with a fresh allowance', async () => {
    const db = setup()
    for (let d = 0; d < SESSION_NOTICE_MAX_PER_EPISODE; d++) {
      __resetSessionNoticeCacheForTests()
      await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + d * DAY })
    }
    __resetSessionNoticeCacheForTests()
    expect((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + 3 * DAY })).status).toBe('capped')
    await resetSessionExpiredNotices(db.client, 'u1')
    __resetSessionNoticeCacheForTests()
    expect((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + 4 * DAY })).status).toBe('sent')
  })

  it('a reconnect handled by ANOTHER instance does not leave this one silent: no in-memory day cache', async () => {
    const db = setup()
    expect((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 })).status).toBe('sent')
    // Переподключение прошло в другом экземпляре функции: он стёр слоты в базе, а память
    // этого экземпляра осталась прежней (тест нарочно НЕ вызывает reset кэша и reset уведомлений).
    db.tables[COUNTER_TABLE] = (db.tables[COUNTER_TABLE] ?? []).filter((r: any) => !String(r.key).startsWith('kaspisessexp'))
    expect((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + 3_600_000 })).status).toBe('sent')
    expect(sendTelegram).toHaveBeenCalledTimes(2)
  })

  it('without a reconnect the same day stays quiet, and the per-outage cap of 3 still holds with no cache at all', async () => {
    const db = setup()
    const statuses: string[] = []
    for (let i = 0; i < 3; i++) statuses.push((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + i * 3_600_000 })).status)
    expect(statuses).toEqual(['sent', 'duplicate', 'duplicate'])
    for (let d = 1; d <= 4; d++) statuses.push((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + d * DAY })).status)
    expect(statuses.slice(3)).toEqual(['sent', 'sent', 'capped', 'capped'])
    expect(sendTelegram).toHaveBeenCalledTimes(SESSION_NOTICE_MAX_PER_EPISODE)
  })

  it('a reconnect also clears the day slot of today: a new outage the same day is announced again', async () => {
    const db = setup()
    expect((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 })).status).toBe('sent')
    __resetSessionNoticeCacheForTests()
    expect((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + 3_600_000 })).status).toBe('duplicate')
    await resetSessionExpiredNotices(db.client, 'u1', T0 + 2 * 3_600_000)
    __resetSessionNoticeCacheForTests()
    expect((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 + 3 * 3_600_000 })).status).toBe('sent')
    expect(sendTelegram).toHaveBeenCalledTimes(2)
  })

  it('respects the seller toggle: Telegram off still leaves the in-app bell', async () => {
    const db = setup({ ...proOwner, notification_prefs: { kaspi_session_expired: { telegram: false } } })
    const res = await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 })
    expect(res).toEqual({ status: 'sent', telegram: false })
    expect(sendTelegram).not.toHaveBeenCalled()
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('a seller without Telegram gets the bell only', async () => {
    const db = setup({ ...proOwner, telegram_chat_id: null })
    expect(await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 })).toEqual({ status: 'sent', telegram: false })
    expect(sendTelegram).not.toHaveBeenCalled()
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('does not notify a deleted account or a seller whose Pro has ended, and does not burn their allowance', async () => {
    const lapsed = { id: 'u1', is_admin: false, plan: 'free', telegram_chat_id: '42', notify_telegram: true, deleted_at: null }
    const db = setup(lapsed)
    expect((await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 })).status).toBe('skipped')
    __resetSessionNoticeCacheForTests()
    const del = setup({ ...proOwner, deleted_at: '2026-11-01T00:00:00Z' })
    expect((await notifySessionExpired(del.client, 'u1', ['A'], { now: T0 })).status).toBe('skipped')
    expect(sendTelegram).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
    // Лимит «трёх за обрыв» не тронут: счётчик обрыва не создан.
    expect((db.tables['tool_kontragent_checks'] || []).filter(r => r.key.startsWith('kaspisessexpn:'))).toHaveLength(0)
  })

  it('stays silent (and never throws) when the counter is unreadable', async () => {
    const db = setup()
    db.fail.add('tool_kontragent_checks')
    const res = await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 })
    expect(res.status).toBe('failed')
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('never throws when Telegram blows up', async () => {
    sendTelegram.mockRejectedValueOnce(new Error('network'))
    const db = setup()
    const res = await notifySessionExpired(db.client, 'u1', ['A'], { now: T0 })
    expect(res.status).toBe('failed')
  })

  it('uses a preloaded profile without reading profiles again', async () => {
    const db = setup(null)
    const res = await notifySessionExpired(db.client, 'u1', ['A'], { now: T0, profile: proOwner })
    expect(res.status).toBe('sent')
  })
})

describe('texts', () => {
  it('escapes store names for Telegram HTML', () => {
    const text = formatSessionExpiredText(['<b>Evil</b> & Co'])
    expect(text).not.toContain('<b>Evil</b>')
    expect(text).toContain('&lt;b&gt;Evil&lt;/b&gt; &amp; Co')
  })

  it('names several stores in the digest line and links to the reconnect page', () => {
    const line = formatSessionExpiredDigestLine(['Первый', 'Второй'])
    expect(line).toContain('«Первый», «Второй»')
    expect(line).toContain('https://invoices.kz/kaspi-shop')
    expect(line).not.toMatch(/[—–]/)
  })
})
