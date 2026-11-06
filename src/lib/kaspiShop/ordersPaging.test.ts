import { describe, it, expect, vi } from 'vitest'
import { paginateOrders, partialLoadMessage, almatyDateStamp, type PagePart } from './ordersPaging'

type O = { code: string }
const orders = (prefix: string, n: number): O[] => Array.from({ length: n }, (_, i) => ({ code: `${prefix}${i}` }))

describe('paginateOrders', () => {
  it('loads every page until the total is reached and reports complete', async () => {
    const fetchPage = vi.fn(async (p: number): Promise<PagePart<O>> => ({ orders: orders(`p${p}-`, p < 2 ? 10 : 5), total: 25 }))
    const out = await paginateOrders({ fetchPage, pageSize: 10, cap: 500 })
    expect(out.orders).toHaveLength(25)
    expect(out).toMatchObject({ total: 25, complete: true, failed: false, capped: false, aborted: false })
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('a real empty status is complete with zero orders', async () => {
    const out = await paginateOrders({ fetchPage: async () => ({ orders: [], total: 0 }), pageSize: 10, cap: 500 })
    expect(out).toMatchObject({ orders: [], total: 0, complete: true, failed: false })
  })

  it('a failure on page 0 is failed with no orders: it is never reported as an empty complete list (K3a)', async () => {
    const out = await paginateOrders<O>({ fetchPage: async () => ({ orders: [], total: 0, failed: true, error: 'Kaspi ответил HTTP 429' }), pageSize: 10, cap: 500 })
    expect(out).toMatchObject({ orders: [], complete: false, failed: true, error: 'Kaspi ответил HTTP 429' })
  })

  it('a failure on page 3 keeps the partial orders, keeps the confirmed total (not zero) and is not complete (K3b)', async () => {
    const fetchPage = async (p: number): Promise<PagePart<O>> =>
      p < 2 ? { orders: orders(`p${p}-`, 10), total: 50 } : { orders: [], total: 0, failed: true, error: 'x' }
    const out = await paginateOrders({ fetchPage, pageSize: 10, cap: 500 })
    expect(out.orders).toHaveLength(20)
    expect(out.total).toBe(50)
    expect(out).toMatchObject({ failed: true, complete: false })
  })

  it('sessionExpired is reported and stops the loop', async () => {
    const fetchPage = vi.fn(async (): Promise<PagePart<O>> => ({ orders: [], total: 0, failed: true, sessionExpired: true }))
    const out = await paginateOrders({ fetchPage, pageSize: 10, cap: 500 })
    expect(out).toMatchObject({ sessionExpired: true, failed: true, complete: false })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('a thrown fetchPage is a failure, not an unhandled exception', async () => {
    const out = await paginateOrders<O>({ fetchPage: async () => { throw new Error('network down') }, pageSize: 10, cap: 500 })
    expect(out).toMatchObject({ failed: true, complete: false, error: 'network down' })
  })

  it('a stale run (shouldStop true after the response) is aborted and flagged so the caller discards it (K1)', async () => {
    let stale = false
    const fetchPage = vi.fn(async (): Promise<PagePart<O>> => { stale = true; return { orders: orders('old', 10), total: 50 } })
    const out = await paginateOrders({ fetchPage, pageSize: 10, cap: 500, shouldStop: () => stale })
    expect(out.aborted).toBe(true)
    expect(out.complete).toBe(false)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('stops at the cap and says capped, never complete', async () => {
    const fetchPage = vi.fn(async (p: number): Promise<PagePart<O>> => ({ orders: orders(`p${p}-`, 10), total: 1000 }))
    const out = await paginateOrders({ fetchPage, pageSize: 10, cap: 30 })
    expect(out.orders).toHaveLength(30)
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(out).toMatchObject({ capped: true, complete: false, failed: false })
  })

  it('a short page before the total is reached is not complete (honest shortfall)', async () => {
    const fetchPage = async (p: number): Promise<PagePart<O>> => (p === 0 ? { orders: orders('a', 10), total: 40 } : { orders: orders('b', 3), total: 40 })
    const out = await paginateOrders({ fetchPage, pageSize: 10, cap: 500 })
    expect(out.orders).toHaveLength(13)
    expect(out.complete).toBe(false)
  })

  it('reports progress as pages arrive', async () => {
    const seen: number[] = []
    await paginateOrders({ fetchPage: async p => ({ orders: orders(`p${p}`, p < 1 ? 10 : 2), total: 12 }), pageSize: 10, cap: 500, onProgress: n => seen.push(n) })
    expect(seen).toEqual([10, 12])
  })
})

describe('partialLoadMessage', () => {
  it('says how much is loaded and asks to repeat on a failure', () => {
    expect(partialLoadMessage(20, 50, true)).toBe('Загружено 20 из 50 — Kaspi прервал ответ, повторите')
    expect(partialLoadMessage(20, 50, false)).toBe('Загружено 20 из 50')
  })
})

describe('almatyDateStamp', () => {
  it('uses the Almaty date, not UTC: 01:30 Almaty on 7 Nov is still 6 Nov in UTC', () => {
    expect(almatyDateStamp(new Date('2026-11-06T20:30:00.000Z'))).toBe('2026-11-07')
  })
  it('midday is the same day', () => {
    expect(almatyDateStamp(new Date('2026-11-06T07:00:00.000Z'))).toBe('2026-11-06')
  })
})
