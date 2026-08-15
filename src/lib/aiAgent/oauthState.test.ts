import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOAuthState, verifyOAuthState } from './oauthState'

describe('createOAuthState / verifyOAuthState', () => {
  beforeEach(() => {
    process.env.AI_AGENT_ENCRYPTION_KEY = 'a'.repeat(64) // 32 bytes hex, matches AES-256 key length used elsewhere in this codebase
  })
  afterEach(() => {
    delete process.env.AI_AGENT_ENCRYPTION_KEY
    vi.useRealTimers()
  })

  it('round-trips the user id through a created state', () => {
    const state = createOAuthState('user-123')
    expect(verifyOAuthState(state)).toEqual({ userId: 'user-123' })
  })

  it('rejects a tampered state', () => {
    const state = createOAuthState('user-123')
    const tampered = state.slice(0, -1) + (state.endsWith('a') ? 'b' : 'a')
    expect(verifyOAuthState(tampered)).toBeNull()
  })

  it('rejects a malformed state with no signature', () => {
    expect(verifyOAuthState('not-a-real-state')).toBeNull()
  })

  it('rejects an expired state', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'))
    const state = createOAuthState('user-123')
    vi.setSystemTime(new Date('2026-08-15T12:11:00.000Z')) // 11 minutes later, past the 10-minute window
    expect(verifyOAuthState(state)).toBeNull()
  })
})
