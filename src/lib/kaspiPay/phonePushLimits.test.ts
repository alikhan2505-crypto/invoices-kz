import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeDb } from '@/lib/fakeDb.testkit'
import { claimPhonePushSlots, PHONE_HOURLY_LIMIT, IP_HOURLY_LIMIT } from './phonePushLimits'
import { COUNTER_TABLE } from '@/lib/toolQuota'

const h = (ip: string | null) => new Headers(ip ? { 'x-forwarded-for': ip } : {})
const NOW = Date.UTC(2026, 9, 24, 10, 30)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('claimPhonePushSlots', () => {
  it('lets PHONE_HOURLY_LIMIT pushes to one number through, then blocks, whatever the user or IP', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect(await claimPhonePushSlots(db.client, h(`1.1.1.${i}`), '+7 777 123 45 67', NOW)).toBe(true)
    }
    expect(await claimPhonePushSlots(db.client, h('9.9.9.9'), '87771234567', NOW)).toBe(false)
  })

  it('a different number from the same IP is fine until the IP limit', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
      expect(await claimPhonePushSlots(db.client, h('2.2.2.2'), `+7 700 000 00 ${String(i).padStart(2, '0')}`, NOW)).toBe(true)
    }
    expect(await claimPhonePushSlots(db.client, h('2.2.2.2'), '+7 701 000 00 99', NOW)).toBe(false)
  })

  it('refunds the phone slot when the IP limit is what blocked the push', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) await claimPhonePushSlots(db.client, h('3.3.3.3'), `+7 700 111 00 ${String(i).padStart(2, '0')}`, NOW)
    expect(await claimPhonePushSlots(db.client, h('3.3.3.3'), '+7 702 000 00 01', NOW)).toBe(false)
    // С другого IP тот же номер всё ещё полностью доступен (слот вернули).
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect(await claimPhonePushSlots(db.client, h(`4.4.4.${i}`), '+7 702 000 00 01', NOW)).toBe(true)
    }
  })

  it('limits reset in the next hour', async () => {
    const db = makeFakeDb()
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) await claimPhonePushSlots(db.client, h('5.5.5.5'), '+7 777 000 00 00', NOW)
    expect(await claimPhonePushSlots(db.client, h('5.5.5.5'), '+7 777 000 00 00', NOW)).toBe(false)
    expect(await claimPhonePushSlots(db.client, h('5.5.5.5'), '+7 777 000 00 00', NOW + 3_600_000)).toBe(true)
  })

  it('without a resolvable IP only the per-phone limit applies (no global bucket)', async () => {
    const db = makeFakeDb()
    expect(await claimPhonePushSlots(db.client, h(null), '+7 777 123 45 67', NOW)).toBe(true)
    expect(await claimPhonePushSlots(db.client, h(null), '+7 700 123 45 67', NOW)).toBe(true)
    expect(db.tables[COUNTER_TABLE].every(r => r.key.startsWith('pushphone:'))).toBe(true)
  })

  it('fails open when the counter table is broken (never block a payment on infra)', async () => {
    const db = makeFakeDb()
    db.failTable = COUNTER_TABLE
    expect(await claimPhonePushSlots(db.client, h('6.6.6.6'), '+7 777 123 45 67', NOW)).toBe(true)
  })

  it('stores no raw phone or IP', async () => {
    const db = makeFakeDb()
    await claimPhonePushSlots(db.client, h('7.7.7.7'), '+7 777 123 45 67', NOW)
    const dump = JSON.stringify(db.tables[COUNTER_TABLE])
    expect(dump).not.toContain('7771234567')
    expect(dump).not.toContain('7.7.7.7')
  })
})
