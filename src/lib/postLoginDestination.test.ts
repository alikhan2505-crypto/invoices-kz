import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { choosePostLoginDestination, readPostLoginIntents, resolvePostLoginDestination } from './postLoginDestination'
import { POST_LOGIN_REDIRECT_KEY, setPostLoginRedirect } from './postLoginRedirect'
import { PENDING_UPGRADE_KEY, setPendingUpgrade } from './pendingUpgrade'

function makeLocal() {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('choosePostLoginDestination', () => {
  it('pending upgrade wins, then the redirect, then homeFor', () => {
    expect(choosePostLoginDestination({ hasPendingUpgrade: true, postLoginRedirect: '/kaspi-shop' }, ['kaspiShop'])).toBe('/upgrade')
    expect(choosePostLoginDestination({ hasPendingUpgrade: false, postLoginRedirect: '/kaspi-api/docs' }, null)).toBe('/kaspi-api/docs')
    expect(choosePostLoginDestination({ hasPendingUpgrade: false, postLoginRedirect: null }, null)).toBe('/dashboard')
    expect(choosePostLoginDestination({ hasPendingUpgrade: false, postLoginRedirect: null }, ['kaspiShop'])).toBe('/kaspi-shop/overview')
    expect(choosePostLoginDestination({ hasPendingUpgrade: false, postLoginRedirect: null }, ['invoices', 'aiAgent'])).toBe('/products')
  })
  it('never sends anyone to /login (no loop from the /login page)', () => {
    for (const enabled of [null, undefined, [], ['invoices'], ['kaspiShop'], ['cfo'], ['x'], 'garbage']) {
      expect(choosePostLoginDestination({ hasPendingUpgrade: false, postLoginRedirect: null }, enabled)).not.toBe('/login')
    }
  })
})

describe('reading stored intents', () => {
  let store: ReturnType<typeof makeLocal>
  beforeEach(() => { store = makeLocal(); vi.stubGlobal('localStorage', store) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('stale intents (the 15.10 bug) fall through to the home page', async () => {
    const old = Date.now() - 2 * 24 * 3600_000
    setPostLoginRedirect('/upgrade', old)
    setPendingUpgrade('pro', 'annual', old)
    const load = vi.fn(async () => ({ enabled_products: ['invoices'], tour_completed_at: '2026-10-01T00:00:00Z' }))
    expect(await resolvePostLoginDestination(load)).toBe('/dashboard')
    expect(load).toHaveBeenCalledOnce()
    expect(store.m.has(POST_LOGIN_REDIRECT_KEY)).toBe(false)
    expect(store.m.has(PENDING_UPGRADE_KEY)).toBe(false)
  })

  it('fresh pending upgrade wins and the redirect is still consumed', async () => {
    setPostLoginRedirect('/kaspi-shop')
    setPendingUpgrade('pro', 'monthly')
    const load = vi.fn(async () => null)
    expect(await resolvePostLoginDestination(load)).toBe('/upgrade')
    expect(load).not.toHaveBeenCalled()
    expect(store.m.has(POST_LOGIN_REDIRECT_KEY)).toBe(false)
    // /upgrade's own mount effect consumes the plan+period payload.
    expect(store.m.has(PENDING_UPGRADE_KEY)).toBe(true)
  })

  it('a fresh redirect is used exactly once', async () => {
    setPostLoginRedirect('/ai-agent')
    expect(await resolvePostLoginDestination(async () => ({ tour_completed_at: '2026-10-01T00:00:00Z' }))).toBe('/ai-agent')
    expect(readPostLoginIntents()).toEqual({ hasPendingUpgrade: false, postLoginRedirect: null })
  })

  it('a failing profile load falls back to /dashboard', async () => {
    expect(await resolvePostLoginDestination(async () => { throw new Error('network') })).toBe('/dashboard')
  })
})

describe('newcomer gets the dashboard tour first (15.10.2026)', () => {
  const none = { hasPendingUpgrade: false, postLoginRedirect: null }
  it('tour not done -> /dashboard, whatever the persona or product landing', () => {
    expect(choosePostLoginDestination(none, ['kaspiShop'], false)).toBe('/dashboard')
    expect(choosePostLoginDestination({ hasPendingUpgrade: false, postLoginRedirect: '/kaspi-shop/overview' }, null, false)).toBe('/dashboard')
    expect(choosePostLoginDestination({ hasPendingUpgrade: false, postLoginRedirect: '/ai-agent/overview' }, ['aiAgent'], false)).toBe('/dashboard')
  })
  it('an explicit wish to pay still wins over the tour', () => {
    expect(choosePostLoginDestination({ hasPendingUpgrade: true, postLoginRedirect: null }, null, false)).toBe('/upgrade')
    expect(choosePostLoginDestination({ hasPendingUpgrade: false, postLoginRedirect: '/upgrade' }, null, false)).toBe('/upgrade')
  })
  it('tour done or unknown -> behaviour unchanged', () => {
    expect(choosePostLoginDestination(none, ['kaspiShop'], true)).toBe('/kaspi-shop/overview')
    expect(choosePostLoginDestination(none, ['kaspiShop'])).toBe('/kaspi-shop/overview')
    expect(choosePostLoginDestination({ hasPendingUpgrade: false, postLoginRedirect: '/cfo/overview' }, null, true)).toBe('/cfo/overview')
  })
})
