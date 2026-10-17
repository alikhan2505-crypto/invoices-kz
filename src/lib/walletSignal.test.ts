import { describe, it, expect, vi, afterEach } from 'vitest'
import { createDebounced, shouldRefreshOnSignal, notifyWalletChanged, WALLET_CHANGED_EVENT } from './walletSignal'

describe('createDebounced', () => {
  afterEach(() => vi.useRealTimers())

  it('collapses a burst of calls into one trailing call', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = createDebounced(fn, 400)
    d.call(); d.call(); d.call()
    vi.advanceTimersByTime(399)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('restarts the wait on each call', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = createDebounced(fn, 400)
    d.call()
    vi.advanceTimersByTime(300)
    d.call()
    vi.advanceTimersByTime(300)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel drops the pending call and later calls work again', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = createDebounced(fn, 400)
    d.call(); d.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
    d.call()
    vi.advanceTimersByTime(400)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('shouldRefreshOnSignal', () => {
  it('refreshes for everyone when the consumer has no own source', () => {
    expect(shouldRefreshOnSignal({ source: 'topbar' })).toBe(true)
    expect(shouldRefreshOnSignal(undefined)).toBe(true)
  })
  it('ignores a signal sent by the consumer itself', () => {
    expect(shouldRefreshOnSignal({ source: 'topbar' }, 'topbar')).toBe(false)
  })
  it('refreshes for a foreign or anonymous signal', () => {
    expect(shouldRefreshOnSignal({ source: 'upgrade' }, 'topbar')).toBe(true)
    expect(shouldRefreshOnSignal({}, 'topbar')).toBe(true)
    expect(shouldRefreshOnSignal(null, 'topbar')).toBe(true)
  })
})

describe('notifyWalletChanged', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does nothing on the server (no window)', () => {
    expect(() => notifyWalletChanged('x')).not.toThrow()
  })

  it('dispatches the named event with the source', () => {
    const dispatchEvent = vi.fn()
    class FakeCustomEvent { type: string; detail: unknown; constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail } }
    vi.stubGlobal('window', { dispatchEvent })
    vi.stubGlobal('CustomEvent', FakeCustomEvent)
    notifyWalletChanged('upgrade')
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    const ev = dispatchEvent.mock.calls[0][0]
    expect(ev.type).toBe(WALLET_CHANGED_EVENT)
    expect(ev.detail).toEqual({ source: 'upgrade' })
  })
})
