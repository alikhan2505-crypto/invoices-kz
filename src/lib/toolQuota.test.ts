import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import {
  almatyDay, almatyQuarter, nextQuarterStart, kpClaimKey, kpLookupKey, remainingOf,
  clientIp, cleanCompanyName, KP_CLAIM_PREFIX, KP_LOOKUP_PREFIX, KP_QUARTER_LIMIT, KP_LOOKUP_QUARTER_LIMIT,
} from './toolQuota'

const utc = (iso: string) => Date.parse(iso)

describe('almaty calendar', () => {
  it('rolls the day over at Almaty midnight (UTC+5), not UTC midnight', () => {
    expect(almatyDay(utc('2026-10-14T18:59:00Z'))).toBe('2026-10-14')
    expect(almatyDay(utc('2026-10-14T19:00:00Z'))).toBe('2026-10-15')
  })

  it('maps months to quarters and switches at Almaty time', () => {
    expect(almatyQuarter(utc('2026-01-15T00:00:00Z'))).toBe('2026-Q1')
    expect(almatyQuarter(utc('2026-05-01T00:00:00Z'))).toBe('2026-Q2')
    expect(almatyQuarter(utc('2026-08-31T00:00:00Z'))).toBe('2026-Q3')
    expect(almatyQuarter(utc('2026-10-14T00:00:00Z'))).toBe('2026-Q4')
    // 30.09 20:00 UTC = 01.10 01:00 в Алматы — уже IV квартал.
    expect(almatyQuarter(utc('2026-09-30T18:59:00Z'))).toBe('2026-Q3')
    expect(almatyQuarter(utc('2026-09-30T20:00:00Z'))).toBe('2026-Q4')
    // Новый год по Алматы наступает 31.12 в 19:00 UTC.
    expect(almatyQuarter(utc('2026-12-31T19:30:00Z'))).toBe('2027-Q1')
  })

  it('names the next reset date: 1 Jan / 1 Apr / 1 Jul / 1 Oct', () => {
    expect(nextQuarterStart(utc('2026-02-10T00:00:00Z'))).toBe('2026-04-01')
    expect(nextQuarterStart(utc('2026-04-01T00:00:00Z'))).toBe('2026-07-01')
    expect(nextQuarterStart(utc('2026-09-30T10:00:00Z'))).toBe('2026-10-01')
    expect(nextQuarterStart(utc('2026-10-14T00:00:00Z'))).toBe('2027-01-01')
    expect(nextQuarterStart(utc('2026-09-30T20:00:00Z'))).toBe('2027-01-01')
  })
})

describe('quota keys', () => {
  it('never stores the raw IP and is stable within a quarter', () => {
    const k = kpClaimKey('203.0.113.7', '2026-Q4')
    expect(k).not.toContain('203.0.113.7')
    expect(k).toBe(kpClaimKey('203.0.113.7', '2026-Q4'))
    expect(k).not.toBe(kpClaimKey('203.0.113.7', '2027-Q1'))
    expect(k).not.toBe(kpClaimKey('203.0.113.8', '2026-Q4'))
  })

  it('keeps kp, kp-lookup and kontragent keys in separate namespaces', () => {
    const kontragent = createHash('sha256').update('203.0.113.7|2026-Q4').digest('hex')
    const claim = kpClaimKey('203.0.113.7', '2026-Q4')
    const lookup = kpLookupKey('203.0.113.7', '2026-Q4')
    expect(claim.startsWith(KP_CLAIM_PREFIX)).toBe(true)
    expect(lookup.startsWith(KP_LOOKUP_PREFIX)).toBe(true)
    // Предохранитель реестров исключает строки по префиксу 'kp:' — живые
    // поиски названия ('kp-lookup:') под него попадать не должны.
    expect(lookup.startsWith(KP_CLAIM_PREFIX)).toBe(false)
    expect(new Set([kontragent, claim, lookup]).size).toBe(3)
    expect(claim.slice(KP_CLAIM_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('remainingOf', () => {
  it('counts down and never goes negative', () => {
    expect(remainingOf(0, KP_QUARTER_LIMIT)).toBe(3)
    expect(remainingOf(2, KP_QUARTER_LIMIT)).toBe(1)
    expect(remainingOf(3, KP_QUARTER_LIMIT)).toBe(0)
    expect(remainingOf(9, KP_QUARTER_LIMIT)).toBe(0)
    expect(remainingOf(-1, KP_QUARTER_LIMIT)).toBe(3)
    expect(remainingOf(Number.NaN, KP_QUARTER_LIMIT)).toBe(3)
  })

  it('gives two live lookups per allowed proposal', () => {
    expect(KP_LOOKUP_QUARTER_LIMIT).toBe(KP_QUARTER_LIMIT)
  })
})

describe('clientIp', () => {
  it('takes the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }))).toBe('198.51.100.4')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})

describe('cleanCompanyName', () => {
  it('returns only a non-empty, whitespace-normalised name', () => {
    expect(cleanCompanyName('  ТОО  «Ромашка» ')).toBe('ТОО «Ромашка»')
    expect(cleanCompanyName('   ')).toBeNull()
    expect(cleanCompanyName(null)).toBeNull()
    expect(cleanCompanyName(42)).toBeNull()
  })
})
