import { describe, it, expect, vi } from 'vitest'
import {
  limiterKey, claimWindowSlot, checkLimits, hashIpForLimiter, pruneLimiterRows, shouldPrune, readBodyCapped, LIMITER_KEY_PREFIX,
} from './widgetLimiter'
import { isValidVisitorId } from './widget'
import { createCounterDbFake } from './counterDbFake.test-util'

const T0 = Date.parse('2026-10-24T10:00:30Z')
const spec = (limit: number, unit: 'm' | 'd' = 'm') => ({ scope: 'wa', id: 'agent-1', unit, limit })

describe('limiterKey', () => {
  it('puts the window bucket right after the prefix so old rows sort and prune by key', () => {
    const k = limiterKey(spec(1), T0)
    expect(k.startsWith(LIMITER_KEY_PREFIX + 'm')).toBe(true)
    expect(k).toMatch(/^wgl:m\d{10}:wa:agent-1$/)
    // следующая минута -- другой ключ, та же минута -- тот же
    expect(limiterKey(spec(1), T0 + 61_000)).not.toBe(k)
    expect(limiterKey(spec(1), T0 + 1_000)).toBe(k)
  })

  it('never collides with other counter namespaces used in the same table', () => {
    // registryLoadToday и другие считают по префиксам kp:/wb:/lookup:/schet: ...
    expect(limiterKey(spec(1), T0).startsWith('wgl:')).toBe(true)
  })
})

describe('hashIpForLimiter', () => {
  it('does not store the raw address', () => {
    const h = hashIpForLimiter('203.0.113.7')
    expect(h).toHaveLength(32)
    expect(h).not.toContain('203')
    expect(hashIpForLimiter('203.0.113.7')).toBe(h)
    expect(hashIpForLimiter('203.0.113.8')).not.toBe(h)
  })
})

describe('claimWindowSlot', () => {
  it('lets exactly `limit` requests through in one window, then refuses', async () => {
    const db = createCounterDbFake()
    const res: string[] = []
    for (let i = 0; i < 5; i++) res.push(await claimWindowSlot(db.client, spec(3), T0))
    expect(res).toEqual(['ok', 'ok', 'ok', 'limited', 'limited'])
  })

  it('opens a fresh window on the next minute', async () => {
    const db = createCounterDbFake()
    await claimWindowSlot(db.client, spec(1), T0)
    expect(await claimWindowSlot(db.client, spec(1), T0)).toBe('limited')
    expect(await claimWindowSlot(db.client, spec(1), T0 + 61_000)).toBe('ok')
  })

  it('writes rows with the fixed 1970 day so the registry daily load never counts them', async () => {
    const db = createCounterDbFake()
    await claimWindowSlot(db.client, spec(5), T0)
    const row = [...db.rows.values()][0]
    expect(row.day).toBe('1970-01-01')
    expect(row.count).toBe(1)
  })

  it('FAILS CLOSED when the counter cannot be read', async () => {
    const db = createCounterDbFake()
    db.fail.read = true
    expect(await claimWindowSlot(db.client, spec(100), T0)).toBe('error')
  })

  it('FAILS CLOSED when the counter cannot be written', async () => {
    const db = createCounterDbFake()
    db.fail.insert = true
    expect(await claimWindowSlot(db.client, spec(100), T0)).toBe('error')
    const db2 = createCounterDbFake()
    await claimWindowSlot(db2.client, spec(100), T0)
    db2.fail.update = true
    expect(await claimWindowSlot(db2.client, spec(100), T0)).toBe('error')
  })

  it('does not exceed the limit under parallel requests (compare-and-swap)', async () => {
    const db = createCounterDbFake()
    const results = await Promise.all(Array.from({ length: 20 }, () => claimWindowSlot(db.client, spec(5), T0)))
    expect(results.filter(r => r === 'ok').length).toBeLessThanOrEqual(5)
    expect([...db.rows.values()][0].count).toBeLessThanOrEqual(5)
    expect(results.every(r => r === 'ok' || r === 'limited')).toBe(true)
  })
})

describe('checkLimits', () => {
  it('returns the first refusal and skips the rest', async () => {
    const db = createCounterDbFake()
    const specs = [
      { scope: 'wi', id: 'ip', unit: 'm' as const, limit: 1 },
      { scope: 'wa', id: 'agent-1', unit: 'm' as const, limit: 60 },
    ]
    expect(await checkLimits(db.client, specs, T0)).toBe('ok')
    expect(await checkLimits(db.client, specs, T0)).toBe('limited')
    // второй лимит не трогали на отказе первого
    const agentRow = [...db.rows.values()].find(r => r.key.includes(':wa:'))
    expect(agentRow?.count).toBe(1)
  })

  it('a daily cap stops a flood even when each minute stays under the minute limit', async () => {
    const db = createCounterDbFake()
    const specs = [
      { scope: 'wa', id: 'agent-1', unit: 'm' as const, limit: 60 },
      { scope: 'wa', id: 'agent-1', unit: 'd' as const, limit: 3 },
    ]
    const out: string[] = []
    for (let i = 0; i < 5; i++) out.push(await checkLimits(db.client, specs, T0 + i * 61_000))
    expect(out).toEqual(['ok', 'ok', 'ok', 'limited', 'limited'])
  })
})

describe('pruneLimiterRows', () => {
  it('removes stale minute/day rows but keeps current ones and foreign keys', async () => {
    const db = createCounterDbFake()
    await claimWindowSlot(db.client, spec(5), T0 - 3_600_000) // час назад
    await claimWindowSlot(db.client, spec(5), T0 - 5 * 86_400_000, ) // 5 суток назад (минутный)
    await claimWindowSlot(db.client, spec(5, 'd'), T0 - 5 * 86_400_000)
    await claimWindowSlot(db.client, spec(5), T0) // текущая
    await claimWindowSlot(db.client, spec(5, 'd'), T0) // текущая
    db.rows.set('kp:abc', { key: 'kp:abc', day: '2026-10-24', count: 2 })
    await pruneLimiterRows(db.client, T0)
    const keys = [...db.rows.keys()]
    expect(keys).toContain('kp:abc')
    expect(keys).toContain(limiterKey(spec(5), T0))
    expect(keys).toContain(limiterKey(spec(5, 'd'), T0))
    expect(keys.filter(k => k.startsWith('wgl:'))).toHaveLength(2)
  })

  it('never throws', async () => {
    const bad = { from() { throw new Error('boom') } } as any
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(pruneLimiterRows(bad)).resolves.toBeUndefined()
    spy.mockRestore()
  })
})

describe('shouldPrune', () => {
  it('fires on a small fraction of requests', () => {
    expect(shouldPrune(0.001)).toBe(true)
    expect(shouldPrune(0.5)).toBe(false)
  })
})

describe('readBodyCapped', () => {
  const mk = (body: string, headers: Record<string, string> = {}) => new Request('https://x.test', { method: 'POST', body, headers })

  it('parses a small JSON body', async () => {
    expect(await readBodyCapped(mk('{"a":1}'), 100)).toEqual({ ok: true, json: { a: 1 } })
  })
  it('rejects an oversized body by length', async () => {
    const r = await readBodyCapped(mk(JSON.stringify({ text: 'x'.repeat(500) })), 100)
    expect(r).toEqual({ ok: false, reason: 'too_large' })
  })
  it('rejects an oversized body by Content-Length before reading', async () => {
    const r = await readBodyCapped(mk('{}', { 'content-length': '999999' }), 100)
    expect(r).toEqual({ ok: false, reason: 'too_large' })
  })
  it('reports invalid JSON', async () => {
    expect(await readBodyCapped(mk('{nope'), 100)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('isValidVisitorId', () => {
  it('accepts what widget.js generates (uuid and the fallback id)', () => {
    expect(isValidVisitorId('3f2b8c1e-9a4d-4e7b-8c11-0a1b2c3d4e5f')).toBe(true)
    expect(isValidVisitorId('1729764000000a1b2c3d4e5f')).toBe(true)
  })
  it('rejects empty, too short, too long and foreign characters', () => {
    expect(isValidVisitorId('')).toBe(false)
    expect(isValidVisitorId('abc')).toBe(false)
    expect(isValidVisitorId('a'.repeat(65))).toBe(false)
    expect(isValidVisitorId('a'.repeat(64))).toBe(true)
    expect(isValidVisitorId('abcdefgh%20<script>')).toBe(false)
    expect(isValidVisitorId('abcd efgh')).toBe(false)
  })
})
