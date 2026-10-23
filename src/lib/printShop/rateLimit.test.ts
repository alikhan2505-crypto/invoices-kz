import { describe, it, expect, beforeEach } from 'vitest'
import {
  claimPrintSlot, dayBucket, hourBucket, isOrderPayable, paymentRequestRateLimited, peekPrintLimit,
  printLimitKey, releasePrintSlot, resetPaymentRequestHits,
  PRINT_LIMIT_PREFIX, PRINT_ORDER_PAYABLE_MS, PRINT_PAYMENT_REQUESTS_PER_MINUTE,
} from './rateLimit'
import { KP_CLAIM_PREFIX } from '@/lib/toolQuota'
import { fakeCounters } from './__testutils__/fakeCounters'

describe('printLimitKey', () => {
  it('hides the raw ip and phone, is stable per window and differs per scope/subject/window', () => {
    const k = printLimitKey('order-ip', '203.0.113.7', '2026-10-24T13')
    expect(k).not.toContain('203.0.113.7')
    expect(k).toBe(printLimitKey('order-ip', '203.0.113.7', '2026-10-24T13'))
    expect(k).not.toBe(printLimitKey('order-ip', '203.0.113.7', '2026-10-24T14'))
    expect(k).not.toBe(printLimitKey('order-ip', '203.0.113.8', '2026-10-24T13'))
    expect(k).not.toBe(printLimitKey('attempt-ip', '203.0.113.7', '2026-10-24T13'))
    const p = printLimitKey('order-phone', '77071234567', '2026-10-24')
    expect(p).not.toContain('77071234567')
    expect(p).not.toBe(printLimitKey('order-phone', '77071234568', '2026-10-24'))
  })

  it('uses a prefix the registry-load fuse already ignores, and a hash that never matches a real kp: key', () => {
    expect(PRINT_LIMIT_PREFIX).toBe(KP_CLAIM_PREFIX)
    expect(printLimitKey('pay-global', 'all', '2026-10-24T13').slice(PRINT_LIMIT_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('counts an IPv6 /64 as one visitor for ip scopes only', () => {
    expect(printLimitKey('order-ip', '2001:db8:1:2:aaaa::1', 'h')).toBe(printLimitKey('order-ip', '2001:db8:1:2:bbbb::9', 'h'))
  })
})

describe('buckets', () => {
  it('hour bucket is UTC hour, day bucket rolls at Almaty midnight', () => {
    expect(hourBucket(Date.parse('2026-10-24T13:45:00Z'))).toBe('2026-10-24T13')
    expect(dayBucket(Date.parse('2026-10-24T18:59:00Z'))).toBe('2026-10-24')
    expect(dayBucket(Date.parse('2026-10-24T19:00:00Z'))).toBe('2026-10-25')
  })
})

describe('claimPrintSlot', () => {
  it('lets exactly LIMIT claims through, then answers limit', async () => {
    const rows: Record<string, number> = {}
    const db = fakeCounters(rows)
    for (let i = 1; i <= 5; i++) {
      expect(await claimPrintSlot(db, 'kp:a', 5)).toEqual({ status: 'claimed', used: i })
    }
    expect(await claimPrintSlot(db, 'kp:a', 5)).toEqual({ status: 'limit' })
    expect(rows['kp:a']).toBe(5)
  })

  it('a burst of parallel claims never exceeds the limit', async () => {
    const rows: Record<string, number> = {}
    const db = fakeCounters(rows)
    const results = await Promise.all(Array.from({ length: 12 }, () => claimPrintSlot(db, 'kp:b', 3)))
    expect(results.filter(r => r.status === 'claimed')).toHaveLength(3)
    expect(rows['kp:b']).toBe(3)
    expect(results.filter(r => r.status === 'unavailable')).toHaveLength(0)
  })

  it('fails closed when the counter cannot be read or written', async () => {
    expect(await claimPrintSlot(fakeCounters({}, { failRead: true }), 'kp:c', 5)).toEqual({ status: 'unavailable' })
    expect(await claimPrintSlot(fakeCounters({ 'kp:d': 1 }, { failUpdate: true }), 'kp:d', 5)).toEqual({ status: 'unavailable' })
  })

  it('release gives the slot back', async () => {
    const rows: Record<string, number> = {}
    const db = fakeCounters(rows)
    const c = await claimPrintSlot(db, 'kp:e', 1)
    expect(c).toEqual({ status: 'claimed', used: 1 })
    expect(await claimPrintSlot(db, 'kp:e', 1)).toEqual({ status: 'limit' })
    await releasePrintSlot(db, 'kp:e', 1)
    expect(rows['kp:e']).toBe(0)
    expect(await claimPrintSlot(db, 'kp:e', 1)).toEqual({ status: 'claimed', used: 1 })
  })
})

describe('peekPrintLimit', () => {
  it('reads without spending a slot', async () => {
    const rows: Record<string, number> = { 'kp:f': 2 }
    const db = fakeCounters(rows)
    expect(await peekPrintLimit(db, 'kp:f', 3)).toBe('ok')
    expect(await peekPrintLimit(db, 'kp:f', 2)).toBe('limit')
    expect(rows['kp:f']).toBe(2)
    expect(await peekPrintLimit(fakeCounters({}, { failRead: true }), 'kp:g', 3)).toBe('unavailable')
  })
})

describe('isOrderPayable', () => {
  const now = Date.parse('2026-10-24T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('accepts only a fresh pending order', () => {
    expect(isOrderPayable({ status: 'pending', created_at: ago(60_000) }, now)).toBe(true)
    expect(isOrderPayable({ status: 'pending', created_at: ago(PRINT_ORDER_PAYABLE_MS) }, now)).toBe(true)
    expect(isOrderPayable({ status: 'pending', created_at: ago(PRINT_ORDER_PAYABLE_MS + 1000) }, now)).toBe(false)
  })

  it('rejects non-pending orders and orders without a usable date', () => {
    expect(isOrderPayable({ status: 'paid', created_at: ago(1000) }, now)).toBe(false)
    expect(isOrderPayable({ status: 'failed', created_at: ago(1000) }, now)).toBe(false)
    expect(isOrderPayable({ status: 'pending' }, now)).toBe(false)
    expect(isOrderPayable({ status: 'pending', created_at: 'not a date' }, now)).toBe(false)
  })
})

describe('paymentRequestRateLimited', () => {
  beforeEach(() => resetPaymentRequestHits())

  it('lets a polling buyer through (20/min) and blocks a flood from one ip only', () => {
    const t = 1_000_000
    for (let i = 0; i < PRINT_PAYMENT_REQUESTS_PER_MINUTE; i++) {
      expect(paymentRequestRateLimited('198.51.100.1', t + i)).toBe(false)
    }
    expect(paymentRequestRateLimited('198.51.100.1', t + 100)).toBe(true)
    expect(paymentRequestRateLimited('198.51.100.2', t + 100)).toBe(false)
    // минуту спустя окно очистилось
    expect(paymentRequestRateLimited('198.51.100.1', t + 120_000)).toBe(false)
  })
})
