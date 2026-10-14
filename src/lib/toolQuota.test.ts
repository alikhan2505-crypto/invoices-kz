import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import {
  almatyDay, almatyQuarter, nextQuarterStart, kpClaimKey, nameLookupKey, parseNameLookupTarget, remainingOf,
  clientIp, cleanCompanyName, KP_CLAIM_PREFIX, NAME_LOOKUP_PREFIX, NAME_LOOKUP_ROLES, NAME_LOOKUP_TOOLS,
  KP_QUARTER_LIMIT, NAME_LOOKUP_QUARTER_LIMIT, claimCounterSlot,
} from './toolQuota'
import type { SupabaseClient } from '@supabase/supabase-js'

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

  it('keeps kp, name-lookup and kontragent keys in separate namespaces', () => {
    const kontragent = createHash('sha256').update('203.0.113.7|2026-Q4').digest('hex')
    const claim = kpClaimKey('203.0.113.7', '2026-Q4')
    const lookup = nameLookupKey('kp', 'client', '203.0.113.7', '2026-Q4')
    expect(claim.startsWith(KP_CLAIM_PREFIX)).toBe(true)
    expect(lookup.startsWith(NAME_LOOKUP_PREFIX)).toBe(true)
    // Предохранитель реестров исключает строки по префиксу 'kp:' — живые
    // поиски названия ('lookup:') под него попадать не должны.
    expect(lookup.startsWith(KP_CLAIM_PREFIX)).toBe(false)
    expect(new Set([kontragent, claim, lookup]).size).toBe(3)
    expect(claim.slice(KP_CLAIM_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/)
    expect(lookup.slice(NAME_LOOKUP_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/)
    // weekly-digest считает проверки контрагента как ключи без «:».
    expect(kontragent).not.toContain(':')
    expect(claim).toContain(':')
    expect(lookup).toContain(':')
  })
})

describe('name lookup quota', () => {
  it('gives every tool+field pair its own counter', () => {
    const keys = new Set<string>()
    for (const tool of NAME_LOOKUP_TOOLS) {
      for (const role of NAME_LOOKUP_ROLES) keys.add(nameLookupKey(tool, role, '203.0.113.7', '2026-Q4'))
    }
    expect(keys.size).toBe(NAME_LOOKUP_TOOLS.length * NAME_LOOKUP_ROLES.length)
    expect(NAME_LOOKUP_TOOLS.length * NAME_LOOKUP_ROLES.length).toBe(8)
  })

  it('is stable per quarter and IP, changes with either, never stores the raw IP', () => {
    const k = nameLookupKey('schet', 'seller', '203.0.113.7', '2026-Q4')
    expect(k).toBe(nameLookupKey('schet', 'seller', '203.0.113.7', '2026-Q4'))
    expect(k).not.toBe(nameLookupKey('schet', 'seller', '203.0.113.7', '2027-Q1'))
    expect(k).not.toBe(nameLookupKey('schet', 'seller', '203.0.113.8', '2026-Q4'))
    expect(k).not.toContain('203.0.113.7')
    expect(k).toBe(NAME_LOOKUP_PREFIX + createHash('sha256').update('lookup|schet|seller|203.0.113.7|2026-Q4').digest('hex'))
  })

  it('allows 3 live registry lookups per field per quarter', () => {
    expect(NAME_LOOKUP_QUARTER_LIMIT).toBe(3)
  })

  it('accepts only whitelisted tool and role', () => {
    expect(parseNameLookupTarget('kp', 'seller')).toEqual({ tool: 'kp', role: 'seller' })
    expect(parseNameLookupTarget('nakladnaya', 'client')).toEqual({ tool: 'nakladnaya', role: 'client' })
    expect(parseNameLookupTarget('avr', 'client')).toEqual({ tool: 'avr', role: 'client' })
    expect(parseNameLookupTarget('schet', 'seller')).toEqual({ tool: 'schet', role: 'seller' })
    expect(parseNameLookupTarget('kontragent', 'client')).toBeNull()
    expect(parseNameLookupTarget('kp', 'buyer')).toBeNull()
    expect(parseNameLookupTarget('KP', 'seller')).toBeNull()
    expect(parseNameLookupTarget(undefined, undefined)).toBeNull()
    expect(parseNameLookupTarget(['kp'], 'seller')).toBeNull()
    expect(parseNameLookupTarget('kp|x', 'seller')).toBeNull()
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

// Мини-подделка tool_kontragent_checks: update().eq().eq().select() и insert()
// с первичным ключом по key — ровно то, чем пользуется claimCounterSlot.
function fakeCounters(rows: Record<string, number>, opts: { failUpdate?: boolean } = {}) {
  const client = {
    from: () => ({
      update: (patch: { count: number }) => {
        const filters: Record<string, unknown> = {}
        const chain = {
          eq: (col: string, v: unknown) => { filters[col] = v; return chain },
          select: async () => {
            if (opts.failUpdate) return { data: null, error: { message: 'boom' } }
            const k = filters.key as string
            if (k in rows && rows[k] === filters.count) { rows[k] = patch.count; return { data: [{ key: k }], error: null } }
            return { data: [], error: null }
          },
        }
        return chain
      },
      insert: async (row: { key: string; count: number }) => {
        if (row.key in rows) return { error: { code: '23505', message: 'duplicate key' } }
        rows[row.key] = row.count
        return { error: null }
      },
    }),
  }
  return client as unknown as SupabaseClient
}

describe('claimCounterSlot (atomic name-lookup budget)', () => {
  it('creates the row on the first lookup and bumps it on the next ones', async () => {
    const rows: Record<string, number> = {}
    const db = fakeCounters(rows)
    expect(await claimCounterSlot(db, 'lookup:a', 0)).toBe('claimed')
    expect(rows['lookup:a']).toBe(1)
    expect(await claimCounterSlot(db, 'lookup:a', 1)).toBe('claimed')
    expect(rows['lookup:a']).toBe(2)
  })

  it('lets only one of several parallel requests with the same stale count through', async () => {
    const rows: Record<string, number> = {}
    const db = fakeCounters(rows)
    const results = await Promise.all([0, 0, 0, 0, 0].map(u => claimCounterSlot(db, 'lookup:b', u)))
    expect(results.filter(r => r === 'claimed')).toHaveLength(1)
    expect(results.filter(r => r === 'raced')).toHaveLength(4)
    expect(rows['lookup:b']).toBe(1)

    const rows2: Record<string, number> = { 'lookup:c': 2 }
    const db2 = fakeCounters(rows2)
    const r2 = await Promise.all([2, 2, 2].map(u => claimCounterSlot(db2, 'lookup:c', u)))
    expect(r2.filter(r => r === 'claimed')).toHaveLength(1)
    expect(rows2['lookup:c']).toBe(3)
  })

  it('reports a database error instead of claiming', async () => {
    expect(await claimCounterSlot(fakeCounters({}, { failUpdate: true }), 'lookup:d', 0)).toBe('error')
  })
})
