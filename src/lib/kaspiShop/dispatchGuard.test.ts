import { describe, it, expect } from 'vitest'
import { makeFakeDb } from '@/lib/fakeDb.testkit'
import { COUNTER_TABLE } from '@/lib/toolQuota'
import { claimDispatchSlot, releaseDispatchSlot } from './dispatchGuard'

const WINDOW = 10 * 60_000
const T0 = Date.parse('2026-11-06T10:03:00Z') // внутри окна 10:00-10:10

describe('claimDispatchSlot (аудит K42)', () => {
  it('первый запуск проходит, второй в том же окне получает «идёт» с временем запуска', async () => {
    const db = makeFakeDb()
    const first = await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, T0)
    expect(first.ok).toBe(true)
    const second = await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, T0 + 60_000)
    expect(second.ok).toBe(false)
    if (!second.ok && second.reason === 'running') {
      expect(second.since).toBe('2026-11-06T10:00:00.000Z')
      // свободно не раньше начала окна через одно: 10:20, то есть через 16 минут от 10:04
      expect(second.retryAfterSeconds).toBe(16 * 60)
    } else {
      throw new Error('expected running')
    }
  })

  it('запуск в конце окна НЕ открывает параллельный запуск в начале следующего', async () => {
    const db = makeFakeDb()
    const endOfWindow = Date.parse('2026-11-06T10:09:30Z')
    expect((await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, endOfWindow)).ok).toBe(true)
    // через 40 секунд уже следующее окно, но прошлый запуск может идти до 9 минут
    const next = await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, Date.parse('2026-11-06T10:10:10Z'))
    expect(next.ok).toBe(false)
    if (!next.ok && next.reason === 'running') expect(next.since).toBe('2026-11-06T10:00:00.000Z')
  })

  it('через окно после занятого слота можно запускать снова', async () => {
    const db = makeFakeDb()
    expect((await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, T0)).ok).toBe(true)
    expect((await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, Date.parse('2026-11-06T10:20:01Z'))).ok).toBe(true)
  })

  it('продавцы друг другу не мешают', async () => {
    const db = makeFakeDb()
    expect((await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, T0)).ok).toBe(true)
    expect((await claimDispatchSlot(db.client, 'p', 'u2', WINDOW, T0)).ok).toBe(true)
  })

  it('последовательные запросы пропускают ровно один', async () => {
    const db = makeFakeDb()
    const results = []
    for (let i = 0; i < 6; i++) results.push(await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, T0))
    expect(results.filter(r => r.ok)).toHaveLength(1)
  })

  it('возврат слота после отказа GitHub освобождает запуск', async () => {
    const db = makeFakeDb()
    const first = await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, T0)
    if (!first.ok) throw new Error('first must pass')
    await releaseDispatchSlot(db.client, first.slotKey)
    expect((await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, T0 + 1000)).ok).toBe(true)
  })

  it('счётчик не читается: reason error (запускать нечего, решает вызывающий)', async () => {
    const db = makeFakeDb()
    db.failTable = COUNTER_TABLE
    const r = await claimDispatchSlot(db.client, 'p', 'u1', WINDOW, T0)
    expect(r).toEqual({ ok: false, reason: 'error' })
  })
})
