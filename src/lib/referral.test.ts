import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REFERRAL_BONUS_DAYS, REFERRAL_MAX_FRIENDS, REFERRAL_NEW_ACCOUNT_DAYS } from './referral'

// Правила живут в базе, числа в коде — копии. Если кто-то поменяет одно без другого,
// страница начнёт обещать то, чего база не делает.
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/audit_2026_11_03_referral_limits.sql'), 'utf8')

describe('referral rules vs migration', () => {
  it('limit of credited friends is the same number in code and SQL', () => {
    expect(sql).toContain(`coalesce(referral_count, 0) < ${REFERRAL_MAX_FRIENDS}`)
  })

  it('new-account window is the same number in code and SQL', () => {
    expect(sql).toContain(`interval '${REFERRAL_NEW_ACCOUNT_DAYS} days'`)
  })

  it('constants are the agreed values', () => {
    expect(REFERRAL_BONUS_DAYS).toBe(7)
    expect(REFERRAL_MAX_FRIENDS).toBe(10)
    expect(REFERRAL_NEW_ACCOUNT_DAYS).toBe(2)
  })
})
