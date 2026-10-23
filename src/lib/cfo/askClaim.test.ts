import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeDb } from '@/lib/fakeDb.testkit'
import { claimAskSlot, releaseAskSlot } from './askClaim'

const TODAY = '2026-10-24'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('claimAskSlot', () => {
  it('claims slot 1 on a fresh company (null day/count) and reports used=0', async () => {
    const db = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: null, ask_count: null }] })
    expect(await claimAskSlot(db.client, 'c1', TODAY, 30)).toEqual({ ok: true, used: 0 })
    expect(db.tables.cfo_companies[0]).toMatchObject({ ask_day: TODAY, ask_count: 1 })
  })

  it('restarts the count on a new day', async () => {
    const db = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: '2026-10-23', ask_count: 30 }] })
    expect(await claimAskSlot(db.client, 'c1', TODAY, 30)).toEqual({ ok: true, used: 0 })
    expect(db.tables.cfo_companies[0]).toMatchObject({ ask_day: TODAY, ask_count: 1 })
  })

  it('refuses at the daily limit without touching the counter', async () => {
    const db = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: TODAY, ask_count: 30 }] })
    expect(await claimAskSlot(db.client, 'c1', TODAY, 30)).toEqual({ ok: false, reason: 'limit' })
    expect(db.tables.cfo_companies[0].ask_count).toBe(30)
  })

  it('a burst of parallel questions cannot exceed the limit', async () => {
    const db = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: TODAY, ask_count: 25 }] })
    const results = await Promise.all(Array.from({ length: 20 }, () => claimAskSlot(db.client, 'c1', TODAY, 30)))
    // Проигравшие 5 гонок подряд получают отказ, поэтому «не больше», а не «ровно».
    const won = results.filter(r => r.ok).length
    expect(won).toBeGreaterThanOrEqual(1)
    expect(won).toBeLessThanOrEqual(5)
    expect(db.tables.cfo_companies[0].ask_count).toBe(25 + won)
  })

  it('a burst on the first question of a new day also stays within the limit', async () => {
    const db = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: '2026-10-23', ask_count: 12 }] })
    const results = await Promise.all(Array.from({ length: 40 }, () => claimAskSlot(db.client, 'c1', TODAY, 30)))
    const won = results.filter(r => r.ok).length
    expect(won).toBeGreaterThanOrEqual(1)
    expect(won).toBeLessThanOrEqual(30)
    expect(db.tables.cfo_companies[0]).toMatchObject({ ask_day: TODAY, ask_count: won })
  })

  it('reports an unknown company and a broken counter distinctly', async () => {
    const db = makeFakeDb({ cfo_companies: [] })
    expect(await claimAskSlot(db.client, 'zz', TODAY, 30)).toEqual({ ok: false, reason: 'no_company' })
    const broken = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: TODAY, ask_count: 0 }] })
    broken.failTable = 'cfo_companies'
    expect(await claimAskSlot(broken.client, 'c1', TODAY, 30)).toEqual({ ok: false, reason: 'error' })
  })
})

describe('releaseAskSlot', () => {
  it('gives back one slot', async () => {
    const db = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: TODAY, ask_count: 4 }] })
    await releaseAskSlot(db.client, 'c1', TODAY)
    expect(db.tables.cfo_companies[0].ask_count).toBe(3)
  })

  it('does nothing when the day rolled over or the count is zero', async () => {
    const rolled = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: '2026-10-25', ask_count: 1 }] })
    await releaseAskSlot(rolled.client, 'c1', TODAY)
    expect(rolled.tables.cfo_companies[0].ask_count).toBe(1)
    const zero = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: TODAY, ask_count: 0 }] })
    await releaseAskSlot(zero.client, 'c1', TODAY)
    expect(zero.tables.cfo_companies[0].ask_count).toBe(0)
  })

  it('claim then release leaves the counter where it was (failed model call is free)', async () => {
    const db = makeFakeDb({ cfo_companies: [{ id: 'c1', ask_day: TODAY, ask_count: 7 }] })
    await claimAskSlot(db.client, 'c1', TODAY, 30)
    await releaseAskSlot(db.client, 'c1', TODAY)
    expect(db.tables.cfo_companies[0].ask_count).toBe(7)
  })
})
