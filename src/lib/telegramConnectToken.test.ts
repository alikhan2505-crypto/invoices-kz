import { describe, it, expect } from 'vitest'
import {
  TELEGRAM_CONNECT_REUSE_MS,
  TELEGRAM_CONNECT_TTL_MS,
  connectTokenExpiresAt,
  connectTokenIssuedAt,
  isConnectTokenFresh,
  isConnectTokenReusable,
  mintConnectToken,
} from './telegramConnectToken'

const HEX = 'a'.repeat(48)
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)

describe('telegram connect token', () => {
  it('fits Telegram start-parameter rules (A-Za-z0-9_-, <= 64)', () => {
    const token = mintConnectToken(HEX, NOW)
    expect(token).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(token.startsWith('planner_')).toBe(false)
  })

  it('round-trips the issue time', () => {
    expect(connectTokenIssuedAt(mintConnectToken(HEX, NOW))).toBe(NOW)
    expect(connectTokenExpiresAt(mintConnectToken(HEX, NOW))).toBe(NOW + TELEGRAM_CONNECT_TTL_MS)
  })

  it('is fresh within the TTL and expired after it', () => {
    const token = mintConnectToken(HEX, NOW)
    expect(isConnectTokenFresh(token, NOW)).toBe(true)
    expect(isConnectTokenFresh(token, NOW + TELEGRAM_CONNECT_TTL_MS - 1)).toBe(true)
    expect(isConnectTokenFresh(token, NOW + TELEGRAM_CONNECT_TTL_MS)).toBe(false)
  })

  it('rejects legacy never-expiring tokens and junk', () => {
    expect(isConnectTokenFresh('f'.repeat(48), NOW)).toBe(false)
    expect(isConnectTokenFresh('', NOW)).toBe(false)
    expect(isConnectTokenFresh(null, NOW)).toBe(false)
    expect(isConnectTokenFresh(`${NOW.toString(36)}_${'g'.repeat(48)}`, NOW)).toBe(false)
    expect(isConnectTokenFresh(`${NOW.toString(36)}_${HEX}x`, NOW)).toBe(false)
  })

  it('rejects tokens issued in the future', () => {
    expect(isConnectTokenFresh(mintConnectToken(HEX, NOW + 5 * 60_000), NOW)).toBe(false)
    expect(isConnectTokenReusable(mintConnectToken(HEX, NOW + 5 * 60_000), NOW)).toBe(false)
  })

  it('is reused only while it has a comfortable margin left', () => {
    const token = mintConnectToken(HEX, NOW)
    expect(isConnectTokenReusable(token, NOW + TELEGRAM_CONNECT_REUSE_MS - 1)).toBe(true)
    expect(isConnectTokenReusable(token, NOW + TELEGRAM_CONNECT_REUSE_MS)).toBe(false)
    expect(TELEGRAM_CONNECT_TTL_MS - TELEGRAM_CONNECT_REUSE_MS).toBeGreaterThanOrEqual(5 * 60_000)
  })
})
