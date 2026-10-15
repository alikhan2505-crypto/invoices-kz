import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  PENDING_UPGRADE_KEY, consumePendingUpgrade, hasPendingUpgrade, pendingUpgradeFromSearch, setPendingUpgrade,
} from './pendingUpgrade'
import { STORED_INTENT_TTL_MS } from './storedIntent'

function makeLocal() {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('pendingUpgradeFromSearch', () => {
  it('accepts a valid plan+period pair', () => {
    expect(pendingUpgradeFromSearch('?plan=pro&period=annual')).toEqual({ plan: 'pro', period: 'annual' })
    expect(pendingUpgradeFromSearch('?plan=basic&period=monthly')).toEqual({ plan: 'basic', period: 'monthly' })
  })
  it('rejects unknown values or a missing half of the pair', () => {
    expect(pendingUpgradeFromSearch('?plan=enterprise&period=monthly')).toBeNull()
    expect(pendingUpgradeFromSearch('?plan=pro&period=weekly')).toBeNull()
    expect(pendingUpgradeFromSearch('?plan=pro')).toBeNull()
    expect(pendingUpgradeFromSearch('')).toBeNull()
  })
})

describe('stored pending upgrade expires after 30 minutes', () => {
  let store: ReturnType<typeof makeLocal>
  const T0 = Date.UTC(2026, 9, 15, 9, 0, 0)
  beforeEach(() => { store = makeLocal(); vi.stubGlobal('localStorage', store) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('fresh: has() peeks without removing, consume() returns it once', () => {
    setPendingUpgrade('pro', 'annual', T0)
    expect(hasPendingUpgrade(T0 + 5 * 60_000)).toBe(true)
    expect(store.m.has(PENDING_UPGRADE_KEY)).toBe(true)
    expect(consumePendingUpgrade(T0 + 5 * 60_000)).toEqual({ plan: 'pro', period: 'annual' })
    expect(store.m.has(PENDING_UPGRADE_KEY)).toBe(false)
    expect(consumePendingUpgrade(T0 + 5 * 60_000)).toBeNull()
  })

  it('stale: has() is false AND removes it, consume() is null', () => {
    setPendingUpgrade('pro', 'monthly', T0)
    expect(hasPendingUpgrade(T0 + STORED_INTENT_TTL_MS + 1)).toBe(false)
    expect(store.m.has(PENDING_UPGRADE_KEY)).toBe(false)
    setPendingUpgrade('basic', 'monthly', T0)
    expect(consumePendingUpgrade(T0 + STORED_INTENT_TTL_MS + 1)).toBeNull()
    expect(store.m.has(PENDING_UPGRADE_KEY)).toBe(false)
  })

  it('legacy entry without a timestamp is stale', () => {
    store.setItem(PENDING_UPGRADE_KEY, JSON.stringify({ plan: 'pro', period: 'annual' }))
    expect(hasPendingUpgrade(T0)).toBe(false)
    expect(store.m.has(PENDING_UPGRADE_KEY)).toBe(false)
    store.setItem(PENDING_UPGRADE_KEY, JSON.stringify({ plan: 'pro', period: 'annual' }))
    expect(consumePendingUpgrade(T0)).toBeNull()
  })

  it('garbage is removed and never counts', () => {
    const garbage = [
      '1', '{', '"pro"', '[]',
      JSON.stringify({ plan: 'gold', period: 'annual', at: T0 }),
      JSON.stringify({ plan: 'pro', period: 'weekly', at: T0 }),
      JSON.stringify({ plan: 'pro', period: 'annual', at: T0 + 3600_000 }),
    ]
    for (const raw of garbage) {
      store.setItem(PENDING_UPGRADE_KEY, raw)
      expect(hasPendingUpgrade(T0)).toBe(false)
      expect(store.m.has(PENDING_UPGRADE_KEY)).toBe(false)
      store.setItem(PENDING_UPGRADE_KEY, raw)
      expect(consumePendingUpgrade(T0)).toBeNull()
      expect(store.m.has(PENDING_UPGRADE_KEY)).toBe(false)
    }
  })

  it('nothing stored', () => {
    expect(hasPendingUpgrade(T0)).toBe(false)
    expect(consumePendingUpgrade(T0)).toBeNull()
  })
})
