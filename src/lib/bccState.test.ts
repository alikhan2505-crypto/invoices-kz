import { describe, it, expect, vi } from 'vitest'
import { signState, verifyState } from './bccState'

describe('signState / verifyState', () => {
  const secret = 'test-secret'

  it('round-trips a valid state', () => {
    const state = signState('user-123', secret)
    expect(verifyState(state, secret)).toEqual({ userId: 'user-123' })
  })

  it('rejects a state signed with a different secret', () => {
    const state = signState('user-123', secret)
    expect(verifyState(state, 'wrong-secret')).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const state = signState('user-123', secret)
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    const tampered = decoded.replace('user-123', 'attacker-999')
    const tamperedState = Buffer.from(tampered).toString('base64url')
    expect(verifyState(tamperedState, secret)).toBeNull()
  })

  it('rejects garbage input without throwing', () => {
    expect(verifyState('not-valid-state', secret)).toBeNull()
  })

  it('rejects an expired state', () => {
    vi.useFakeTimers()
    const state = signState('user-123', secret)
    vi.advanceTimersByTime(11 * 60 * 1000)
    expect(verifyState(state, secret)).toBeNull()
    vi.useRealTimers()
  })
})
