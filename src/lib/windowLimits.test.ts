import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeDb } from './fakeDb.testkit'
import {
  claimWindowSlot, releaseWindowSlot, windowKey, phoneLimitSubject, hourBucket, WINDOW_SENTINEL_DAY,
} from './windowLimits'
import { COUNTER_TABLE } from './toolQuota'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('windowKey / phoneLimitSubject', () => {
  it('is stable, namespaced and never contains the raw subject', () => {
    const k = windowKey('pushphone', '7771234567', 5)
    expect(k).toMatch(/^pushphone:[0-9a-f]{64}$/)
    expect(k).toBe(windowKey('pushphone', '7771234567', 5))
    expect(k).not.toContain('7771234567')
    expect(windowKey('pushphone', '7771234567', 6)).not.toBe(k)
  })

  it('treats +7, 8 and 7 prefixes of one number as the same subject', () => {
    expect(phoneLimitSubject('+7 777 123 45 67')).toBe('7771234567')
    expect(phoneLimitSubject('87771234567')).toBe('7771234567')
    expect(phoneLimitSubject('77771234567')).toBe('7771234567')
    expect(phoneLimitSubject(undefined)).toBe('')
  })

  it('hour bucket changes on the hour', () => {
    expect(hourBucket(3_599_999)).toBe(0)
    expect(hourBucket(3_600_000)).toBe(1)
  })
})

describe('claimWindowSlot', () => {
  it('claims up to the limit, then refuses', async () => {
    const db = makeFakeDb()
    const key = windowKey('t', 'x', 1)
    expect(await claimWindowSlot(db.client, key, 2)).toEqual({ ok: true, used: 1 })
    expect(await claimWindowSlot(db.client, key, 2)).toEqual({ ok: true, used: 2 })
    expect(await claimWindowSlot(db.client, key, 2)).toEqual({ ok: false, reason: 'limit' })
    expect(db.tables[COUNTER_TABLE]).toHaveLength(1)
    expect(db.tables[COUNTER_TABLE][0]).toMatchObject({ key, count: 2, day: WINDOW_SENTINEL_DAY })
  })

  it('parallel claims cannot exceed the limit (compare-and-swap)', async () => {
    const db = makeFakeDb()
    const key = windowKey('t', 'race', 1)
    const results = await Promise.all(Array.from({ length: 12 }, () => claimWindowSlot(db.client, key, 5)))
    // Проигравшие 5 гонок подряд получают отказ, поэтому «не больше», а не «ровно».
    const won = results.filter(r => r.ok).length
    expect(won).toBeGreaterThanOrEqual(1)
    expect(won).toBeLessThanOrEqual(5)
    expect(db.tables[COUNTER_TABLE][0].count).toBe(won)
  })

  it('reports error when the counter is unreadable', async () => {
    const db = makeFakeDb()
    db.failTable = COUNTER_TABLE
    expect(await claimWindowSlot(db.client, 'k', 3)).toEqual({ ok: false, reason: 'error' })
  })

  it('keeps independent counters per key', async () => {
    const db = makeFakeDb()
    expect((await claimWindowSlot(db.client, windowKey('t', 'a', 1), 1)).ok).toBe(true)
    expect((await claimWindowSlot(db.client, windowKey('t', 'b', 1), 1)).ok).toBe(true)
    expect((await claimWindowSlot(db.client, windowKey('t', 'a', 1), 1)).ok).toBe(false)
  })
})

describe('releaseWindowSlot', () => {
  it('gives the slot back', async () => {
    const db = makeFakeDb()
    const key = windowKey('t', 'r', 1)
    await claimWindowSlot(db.client, key, 1)
    expect((await claimWindowSlot(db.client, key, 1)).ok).toBe(false)
    await releaseWindowSlot(db.client, key)
    expect((await claimWindowSlot(db.client, key, 1)).ok).toBe(true)
  })

  it('never goes below zero and does not throw on a missing row', async () => {
    const db = makeFakeDb()
    await releaseWindowSlot(db.client, 'nope')
    expect(db.tables[COUNTER_TABLE] ?? []).toHaveLength(0)
  })
})
