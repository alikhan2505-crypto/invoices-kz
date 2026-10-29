import { describe, it, expect } from 'vitest'
import { BIN_WATCH_ADMIN_ONLY, BIN_WATCH_LIMITS, binWatchLimit, canUseBinWatch } from './config'

const now = new Date('2026-10-30T00:00:00Z')
const future = '2027-01-01T00:00:00'
const past = '2026-01-01T00:00:00'

describe('админ-гейт', () => {
  it('включён по умолчанию, пока основатель не проверил раздел', () => {
    expect(BIN_WATCH_ADMIN_ONLY).toBe(true)
  })
  it('открыт только админу', () => {
    expect(canUseBinWatch(true)).toBe(true)
    expect(canUseBinWatch(false)).toBe(false)
    expect(canUseBinWatch(null)).toBe(false)
    expect(canUseBinWatch(undefined)).toBe(false)
  })
})

describe('лимит списка по тарифу', () => {
  it('константы: Free 5, Про 50', () => {
    expect(BIN_WATCH_LIMITS).toEqual({ free: 5, pro: 50 })
  })
  it('Free, нет профиля, Базовый, пробный и бонус - 5', () => {
    expect(binWatchLimit(null, now)).toBe(5)
    expect(binWatchLimit({ plan: 'free' }, now)).toBe(5)
    expect(binWatchLimit({ plan: 'basic', plan_expires_at: future }, now)).toBe(5)
    expect(binWatchLimit({ plan: 'free', trial_expires_at: '2027-01-01T00:00:00Z' }, now)).toBe(5)
    expect(binWatchLimit({ plan: 'free', bonus_expires_at: future }, now)).toBe(5)
  })
  it('действующий Про - 50', () => {
    expect(binWatchLimit({ plan: 'pro', plan_expires_at: future }, now)).toBe(50)
    expect(binWatchLimit({ plan: 'pro', plan_expires_at: null }, now)).toBe(50)
  })
  it('истёкший Про снова 5', () => {
    expect(binWatchLimit({ plan: 'pro', plan_expires_at: past }, now)).toBe(5)
  })
  it('админ считается Про, даже с истёкшим тарифом', () => {
    expect(binWatchLimit({ is_admin: true, plan: 'free' }, now)).toBe(50)
    expect(binWatchLimit({ is_admin: true, plan: 'pro', plan_expires_at: past }, now)).toBe(50)
  })
})
