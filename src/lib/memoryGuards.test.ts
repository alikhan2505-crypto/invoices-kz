import { describe, it, expect } from 'vitest'
import { createBurstLimiter, createIntervalGate } from './memoryGuards'

const T0 = 1_000_000

describe('createBurstLimiter', () => {
  it('lets exactly `limit` hits through in the window, then refuses', () => {
    const l = createBurstLimiter({ limit: 3, windowMs: 60_000 })
    const out = [0, 1, 2, 3, 4].map(i => l.hit('ip', T0 + i))
    expect(out).toEqual([true, true, true, false, false])
  })

  it('frees a slot once the oldest hit leaves the window (sliding, not fixed)', () => {
    const l = createBurstLimiter({ limit: 2, windowMs: 60_000 })
    expect(l.hit('ip', T0)).toBe(true)
    expect(l.hit('ip', T0 + 30_000)).toBe(true)
    expect(l.hit('ip', T0 + 59_999)).toBe(false)
    // первое обращение вышло из окна, второе ещё внутри
    expect(l.hit('ip', T0 + 60_000)).toBe(true)
    expect(l.hit('ip', T0 + 60_001)).toBe(false)
  })

  it('does not record refused hits, so a client that keeps polling recovers after one window', () => {
    const l = createBurstLimiter({ limit: 2, windowMs: 60_000 })
    l.hit('ip', T0)
    l.hit('ip', T0 + 1)
    // 100 отказанных попыток подряд не продлевают блокировку
    for (let i = 0; i < 100; i++) expect(l.hit('ip', T0 + 10_000 + i)).toBe(false)
    expect(l.hit('ip', T0 + 60_000)).toBe(true)
  })

  it('keeps keys independent', () => {
    const l = createBurstLimiter({ limit: 1, windowMs: 60_000 })
    expect(l.hit('a', T0)).toBe(true)
    expect(l.hit('a', T0)).toBe(false)
    expect(l.hit('b', T0)).toBe(true)
  })

  it('isOver reports the limit without recording a hit', () => {
    const l = createBurstLimiter({ limit: 2, windowMs: 60_000 })
    for (let i = 0; i < 50; i++) expect(l.isOver('ip', T0)).toBe(false)
    l.record('ip', T0)
    expect(l.isOver('ip', T0)).toBe(false)
    l.record('ip', T0 + 1)
    expect(l.isOver('ip', T0 + 2)).toBe(true)
    // и снова свободно, когда записи вышли из окна
    expect(l.isOver('ip', T0 + 60_002)).toBe(false)
  })

  it('record never grows the history past the limit', () => {
    const l = createBurstLimiter({ limit: 2, windowMs: 60_000 })
    for (let i = 0; i < 1000; i++) l.record('ip', T0 + i)
    expect(l.isOver('ip', T0 + 59_999)).toBe(true)
    // если бы записи копились (1000 штук), ключ остался бы заблокированным и после
    // выхода двух первых
    expect(l.isOver('ip', T0 + 60_002)).toBe(false)
  })

  it('bounds memory: sweeps expired keys first, then evicts the least recently touched', () => {
    const l = createBurstLimiter({ limit: 5, windowMs: 60_000, maxKeys: 3 })
    l.hit('a', T0)
    l.hit('b', T0 + 1)
    l.hit('c', T0 + 2)
    expect(l.size()).toBe(3)
    // все три ещё живые: новый ключ вытесняет самый давний (a)
    l.hit('d', T0 + 3)
    expect(l.size()).toBe(3)
    // 'a' вытеснен -> у него снова полный лимит; 'b' и 'c' помнятся
    for (let i = 0; i < 5; i++) expect(l.hit('a', T0 + 4 + i)).toBe(true)
    // просроченные ключи убираются уборкой, а не вытеснением живых
    const l2 = createBurstLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 })
    l2.hit('x', T0)
    l2.hit('y', T0 + 1)
    l2.hit('z', T0 + 5000)
    expect(l2.size()).toBeLessThanOrEqual(2)
    expect(l2.hit('z', T0 + 5001)).toBe(false)
  })

  it('a touched key becomes the newest, so a busy attacker key is not evicted first', () => {
    const l = createBurstLimiter({ limit: 2, windowMs: 60_000, maxKeys: 2 })
    l.hit('busy', T0)
    l.hit('quiet', T0 + 1)
    l.hit('busy', T0 + 2) // busy обновился -> самый давний теперь quiet
    l.hit('new', T0 + 3)
    expect(l.hit('busy', T0 + 4)).toBe(false) // busy помнится: 2 из 2
  })

  it('exempt keys are never counted or refused (the shared "unknown" bucket must not lock everybody out)', () => {
    const l = createBurstLimiter({ limit: 2, windowMs: 1000, exemptKeys: ['unknown'] })
    for (let i = 0; i < 50; i++) expect(l.hit('unknown', 0)).toBe(true)
    l.record('unknown', 0)
    expect(l.isOver('unknown', 0)).toBe(false)
    expect(l.size()).toBe(0)
    // а обычные ключи считаются как прежде
    expect(l.hit('a', 0)).toBe(true)
    expect(l.hit('a', 0)).toBe(true)
    expect(l.hit('a', 0)).toBe(false)
  })

  it('reset forgets everything', () => {
    const l = createBurstLimiter({ limit: 1, windowMs: 60_000 })
    l.hit('ip', T0)
    expect(l.hit('ip', T0)).toBe(false)
    l.reset()
    expect(l.size()).toBe(0)
    expect(l.hit('ip', T0)).toBe(true)
  })
})

describe('createIntervalGate', () => {
  it('is due the first time, then not until the gap has passed', () => {
    const g = createIntervalGate(60_000)
    expect(g.due(T0)).toBe(true)
    expect(g.due(T0 + 1)).toBe(false)
    expect(g.due(T0 + 59_999)).toBe(false)
    expect(g.due(T0 + 60_000)).toBe(true)
    expect(g.due(T0 + 60_001)).toBe(false)
  })

  it('is not stuck when the clock steps backwards', () => {
    const g = createIntervalGate(60_000)
    expect(g.due(T0)).toBe(true)
    expect(g.due(T0 - 10_000)).toBe(true)
  })

  it('reset makes it due again', () => {
    const g = createIntervalGate(60_000)
    g.due(T0)
    g.reset()
    expect(g.due(T0 + 1)).toBe(true)
  })
})
