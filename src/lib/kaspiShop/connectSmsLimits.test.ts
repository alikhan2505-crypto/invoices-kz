import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSecDb } from './secDb.testkit'
import {
  claimConnectSmsSlots, releaseConnectSmsSlots, secondsToNextHour, USER_HOURLY_LIMIT, PHONE_HOURLY_LIMIT, IP_HOURLY_LIMIT,
} from './connectSmsLimits'
import { COUNTER_TABLE } from '@/lib/toolQuota'

const h = (ip: string | null) => new Headers(ip ? { 'x-forwarded-for': ip } : {})
const NOW = Date.UTC(2026, 10, 7, 10, 30)
const phoneN = (i: number) => `+7 700 000 ${String(Math.floor(i / 100)).padStart(2, '0')} ${String(i % 100).padStart(2, '0')}`

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('claimConnectSmsSlots', () => {
  it('limits one user to USER_HOURLY_LIMIT SMS per hour, whatever the phone and IP', async () => {
    const db = makeSecDb()
    for (let i = 0; i < USER_HOURLY_LIMIT; i++) {
      expect(await claimConnectSmsSlots(db.client, h(`1.1.1.${i}`), 'u1', phoneN(i), NOW)).toEqual({ ok: true })
    }
    const res = await claimConnectSmsSlots(db.client, h('9.9.9.9'), 'u1', phoneN(77), NOW)
    expect(res).toMatchObject({ ok: false, reason: 'limit', scope: 'user' })
    // Другой пользователь не затронут.
    expect(await claimConnectSmsSlots(db.client, h('9.9.9.9'), 'u2', phoneN(77), NOW)).toEqual({ ok: true })
  })

  it('limits one phone to PHONE_HOURLY_LIMIT per hour across different users and IPs (+7, 8 and 7 are one number)', async () => {
    const db = makeSecDb()
    const forms = ['+7 777 123 45 67', '87771234567', '77771234567']
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect(await claimConnectSmsSlots(db.client, h(`2.2.2.${i}`), `user${i}`, forms[i % 3], NOW)).toEqual({ ok: true })
    }
    const res = await claimConnectSmsSlots(db.client, h('2.2.2.99'), 'someone-else', '+7 777 123 45 67', NOW)
    expect(res).toMatchObject({ ok: false, reason: 'limit', scope: 'phone' })
  })

  it('limits one IP to IP_HOURLY_LIMIT per hour across users and phones', async () => {
    const db = makeSecDb()
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
      expect(await claimConnectSmsSlots(db.client, h('3.3.3.3'), `user${i}`, phoneN(i), NOW)).toEqual({ ok: true })
    }
    const res = await claimConnectSmsSlots(db.client, h('3.3.3.3'), 'user-new', phoneN(500), NOW)
    expect(res).toMatchObject({ ok: false, reason: 'limit', scope: 'ip' })
  })

  it('refunds the slots of THIS call when a later limit blocks (nothing is sent)', async () => {
    const db = makeSecDb()
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) await claimConnectSmsSlots(db.client, h('4.4.4.4'), `user${i}`, phoneN(i), NOW)
    const before = db.tables[COUNTER_TABLE].map(r => ({ ...r }))
    const res = await claimConnectSmsSlots(db.client, h('4.4.4.4'), 'fresh', '+7 702 000 00 01', NOW)
    expect(res).toMatchObject({ ok: false, scope: 'ip' })
    // Пользователь и номер этого вызова возвращены: у «fresh» снова пять попыток, у номера три.
    const used = (prefixless: string) => db.tables[COUNTER_TABLE].filter(r => r.key.startsWith(prefixless)).reduce((s, r) => s + r.count, 0)
    expect(used('kaspiconnuser:')).toBe(IP_HOURLY_LIMIT)
    expect(used('kaspiconnphone:')).toBe(IP_HOURLY_LIMIT)
    expect(db.tables[COUNTER_TABLE].filter(r => !before.find(b => b.key === r.key) && r.count > 0)).toHaveLength(0)
  })

  it('does not hand back slots used by earlier calls (failed Kaspi attempts keep counting)', async () => {
    const db = makeSecDb()
    // Три попытки на один номер: Kaspi мог отказать, слот всё равно потрачен.
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) await claimConnectSmsSlots(db.client, h('5.5.5.5'), 'u1', '+7 777 000 00 00', NOW)
    expect(await claimConnectSmsSlots(db.client, h('5.5.5.5'), 'u1', '+7 777 000 00 00', NOW)).toMatchObject({ ok: false, scope: 'phone' })
  })

  it('releaseConnectSmsSlots gives back the three slots of this call but not of earlier calls', async () => {
    const db = makeSecDb()
    const total = () => (db.tables[COUNTER_TABLE] ?? []).reduce((s, r) => s + r.count, 0)
    await claimConnectSmsSlots(db.client, h('6.6.6.6'), 'u1', '+7 777 000 00 00', NOW)
    expect(total()).toBe(3)
    await claimConnectSmsSlots(db.client, h('6.6.6.6'), 'u1', '+7 777 000 00 00', NOW)
    expect(total()).toBe(6)
    await releaseConnectSmsSlots(db.client, h('6.6.6.6'), 'u1', '8 777 000 00 00', NOW)
    expect(total()).toBe(3)
  })

  it('releaseConnectSmsSlots never goes below zero and ignores an unknown IP', async () => {
    const db = makeSecDb()
    await releaseConnectSmsSlots(db.client, h(null), 'u1', '+7 777 000 00 00', NOW)
    expect((db.tables[COUNTER_TABLE] ?? []).every(r => r.count >= 0)).toBe(true)
    await claimConnectSmsSlots(db.client, h(null), 'u1', '+7 777 000 00 00', NOW)
    await releaseConnectSmsSlots(db.client, h(null), 'u1', '+7 777 000 00 00', NOW)
    expect((db.tables[COUNTER_TABLE] ?? []).reduce((s, r) => s + r.count, 0)).toBe(0)
  })

  it('answers with seconds until the next hour and resets in the next hour', async () => {
    const db = makeSecDb()
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) await claimConnectSmsSlots(db.client, h('6.6.6.6'), 'u1', '+7 777 000 00 00', NOW)
    const res = await claimConnectSmsSlots(db.client, h('6.6.6.6'), 'u1', '+7 777 000 00 00', NOW)
    expect(res).toMatchObject({ ok: false, retryAfterSec: 30 * 60 })
    expect(await claimConnectSmsSlots(db.client, h('6.6.6.6'), 'u1', '+7 777 000 00 00', NOW + 3_600_000)).toEqual({ ok: true })
    expect(secondsToNextHour(Date.UTC(2026, 0, 1, 10, 59, 59, 500))).toBe(1)
  })

  it('without a resolvable IP the user and phone limits still apply (no global bucket)', async () => {
    const db = makeSecDb()
    for (let i = 0; i < 20; i++) {
      expect(await claimConnectSmsSlots(db.client, h(null), `u${i}`, phoneN(i), NOW)).toEqual({ ok: true })
    }
    expect(db.tables[COUNTER_TABLE].some(r => r.key.startsWith('kaspiconnip:'))).toBe(false)
  })

  it('fails closed when the counter is unavailable', async () => {
    const db = makeSecDb()
    db.fail.add(COUNTER_TABLE)
    expect(await claimConnectSmsSlots(db.client, h('7.7.7.7'), 'u1', '+7 777 000 00 00', NOW)).toEqual({ ok: false, reason: 'error' })
  })

  it('never stores raw ids, phones or IPs', async () => {
    const db = makeSecDb()
    await claimConnectSmsSlots(db.client, h('8.8.8.8'), 'user-secret-id', '+7 777 123 45 67', NOW)
    const dump = JSON.stringify(db.tables[COUNTER_TABLE])
    expect(dump).not.toContain('user-secret-id')
    expect(dump).not.toContain('7771234567')
    expect(dump).not.toContain('8.8.8.8')
  })
})
