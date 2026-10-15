import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import {
  almatyDay, almatyQuarter, nextQuarterStart, kpClaimKey, nameLookupKey, parseNameLookupTarget, remainingOf,
  clientIp, cleanCompanyName, KP_CLAIM_PREFIX, NAME_LOOKUP_PREFIX, NAME_LOOKUP_ROLES, NAME_LOOKUP_TOOLS,
  KP_QUARTER_LIMIT, NAME_LOOKUP_QUARTER_LIMIT, claimCounterSlot,
  almatyMonth, nextMonthStart, waybillsKey, WAYBILLS_PREFIX, WAYBILLS_MONTH_LIMIT, bearerUserId,
  quotaIp, releaseCounterSlot, waybillsUnlimited,
  docToolKey, DOC_QUOTA_TOOLS, DOC_TOOL_QUARTER_LIMIT, parseDocQuotaTool, registryLoadToday,
} from './toolQuota'
import { KASPI_SHOP_PROFILE_COLUMNS } from '@/lib/kaspiShop/planGate'
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

describe('almaty month (waybills limit)', () => {
  it('switches the month at Almaty midnight, not UTC midnight', () => {
    expect(almatyMonth(utc('2026-10-15T00:00:00Z'))).toBe('2026-10')
    expect(almatyMonth(utc('2026-10-31T18:59:00Z'))).toBe('2026-10')
    // 31.10 19:30 UTC = 01.11 00:30 в Алматы — уже ноябрь.
    expect(almatyMonth(utc('2026-10-31T19:30:00Z'))).toBe('2026-11')
    expect(almatyMonth(utc('2026-12-31T19:30:00Z'))).toBe('2027-01')
  })

  it('names the first day of the next Almaty month, rolling December into January', () => {
    expect(nextMonthStart(utc('2026-10-15T00:00:00Z'))).toBe('2026-11-01')
    expect(nextMonthStart(utc('2026-10-31T19:30:00Z'))).toBe('2026-12-01')
    expect(nextMonthStart(utc('2026-12-10T00:00:00Z'))).toBe('2027-01-01')
    expect(nextMonthStart(utc('2026-12-31T19:30:00Z'))).toBe('2027-02-01')
    expect(nextMonthStart(utc('2027-01-31T12:00:00Z'))).toBe('2027-02-01')
  })

  it('limits anonymous merges to 5 a month', () => {
    expect(WAYBILLS_MONTH_LIMIT).toBe(5)
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

  it('gives waybills its own wb: namespace, per IP and per month', () => {
    const k = waybillsKey('203.0.113.7', '2026-10')
    expect(k.startsWith(WAYBILLS_PREFIX)).toBe(true)
    expect(WAYBILLS_PREFIX).toBe('wb:')
    expect(k.slice(WAYBILLS_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/)
    expect(k).not.toContain('203.0.113.7')
    expect(k).toBe(waybillsKey('203.0.113.7', '2026-10'))
    expect(k).not.toBe(waybillsKey('203.0.113.7', '2026-11'))
    expect(k).not.toBe(waybillsKey('203.0.113.8', '2026-10'))
    expect(k).not.toBe(kpClaimKey('203.0.113.7', '2026-10'))
    expect(k.startsWith(KP_CLAIM_PREFIX)).toBe(false)
  })
})

describe('doc tool quota keys (Счёт, АВР, накладная: 3 в квартал на IP)', () => {
  it('limits each document tool to 3 per quarter', () => {
    expect(DOC_TOOL_QUARTER_LIMIT).toBe(3)
    expect([...DOC_QUOTA_TOOLS]).toEqual(['schet', 'avr', 'nakladnaya'])
  })

  it('prefixes every key with the tool name and a colon (weekly-digest skips keys with ":")', () => {
    for (const tool of DOC_QUOTA_TOOLS) {
      const k = docToolKey(tool, '203.0.113.7', '2026-Q4')
      expect(k.startsWith(`${tool}:`)).toBe(true)
      expect(k.slice(tool.length + 1)).toMatch(/^[0-9a-f]{64}$/)
      expect(k).not.toContain('203.0.113.7')
      expect(k).toBe(`${tool}:` + createHash('sha256').update(`${tool}|203.0.113.7|2026-Q4`).digest('hex'))
    }
  })

  it('gives different tools, quarters and IPs different keys', () => {
    const keys = DOC_QUOTA_TOOLS.map(tool => docToolKey(tool, '203.0.113.7', '2026-Q4'))
    expect(new Set(keys).size).toBe(3)
    expect(docToolKey('schet', '203.0.113.7', '2026-Q4')).not.toBe(docToolKey('schet', '203.0.113.7', '2027-Q1'))
    expect(docToolKey('schet', '203.0.113.7', '2026-Q4')).not.toBe(docToolKey('schet', '203.0.113.8', '2026-Q4'))
    expect(docToolKey('avr', '203.0.113.7', '2026-Q4')).not.toBe(kpClaimKey('203.0.113.7', '2026-Q4'))
    expect(docToolKey('schet', '203.0.113.7', '2026-Q4')).toBe(docToolKey('schet', '203.0.113.7', '2026-Q4'))
  })

  it('counts an IPv6 /64 as one visitor', () => {
    expect(docToolKey('nakladnaya', '2001:db8:1:2:aaaa::1', '2026-Q4'))
      .toBe(docToolKey('nakladnaya', '2001:db8:1:2:bbbb:cccc:dddd:eeee', '2026-Q4'))
  })

  it('accepts only whitelisted tools', () => {
    expect(parseDocQuotaTool('schet')).toBe('schet')
    expect(parseDocQuotaTool('avr')).toBe('avr')
    expect(parseDocQuotaTool('nakladnaya')).toBe('nakladnaya')
    expect(parseDocQuotaTool('kp')).toBeNull()
    expect(parseDocQuotaTool('')).toBeNull()
    expect(parseDocQuotaTool(undefined)).toBeNull()
    expect(parseDocQuotaTool(['schet'])).toBeNull()
  })
})

describe('registryLoadToday', () => {
  it('skips rows that never touch the registries: kp:, wb: and the document tools', async () => {
    const excluded: string[] = []
    const q: any = {
      select: () => q,
      eq: () => q,
      not: (_col: string, _op: string, v: string) => { excluded.push(v); return q },
      then: (resolve: (r: unknown) => void) => resolve({ data: [{ count: 2 }, { count: 3 }] }),
    }
    const load = await registryLoadToday({ from: () => q } as unknown as SupabaseClient)
    expect(load).toBe(5)
    expect(excluded.sort()).toEqual(['avr:%', 'kp:%', 'nakladnaya:%', 'schet:%', 'wb:%'])
  })
})

describe('quotaIp (IPv6 по /64)', () => {
  it('keeps IPv4 as is and unwraps IPv4-mapped IPv6', () => {
    expect(quotaIp('203.0.113.7')).toBe('203.0.113.7')
    expect(quotaIp('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(quotaIp('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7')
  })

  it('cuts IPv6 to its /64 prefix whatever the notation', () => {
    expect(quotaIp('2a02:2168:8f1:5a00:1:2:3:4')).toBe('2a02:2168:8f1:5a00::/64')
    expect(quotaIp('2A02:2168:08F1:5A00:abcd::1')).toBe('2a02:2168:8f1:5a00::/64')
    expect(quotaIp('[2a02:2168:8f1:5a00::9]')).toBe('2a02:2168:8f1:5a00::/64')
    expect(quotaIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
    expect(quotaIp('2001:db8::')).toBe('2001:db8:0:0::/64')
  })

  it('returns unparsable strings unchanged', () => {
    expect(quotaIp('unknown')).toBe('unknown')
    expect(quotaIp('1::2::3')).toBe('1::2::3')
    expect(quotaIp('zz:1::')).toBe('zz:1::')
  })

  it('gives every address of one /64 the same waybills key, another /64 a different one', () => {
    const a = waybillsKey('2a02:2168:8f1:5a00::1', '2026-10')
    expect(waybillsKey('2a02:2168:8f1:5a00:dead:beef:0:2', '2026-10')).toBe(a)
    expect(waybillsKey('2a02:2168:8f1:5a01::1', '2026-10')).not.toBe(a)
  })
})

describe('bearerUserId', () => {
  const client = (getUser: (token: string) => unknown) =>
    ({ auth: { getUser: async (token: string) => getUser(token) } }) as unknown as SupabaseClient
  const ok = client(token => (token === 'good' ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } }))

  it('returns the user id for a valid Bearer token', async () => {
    expect(await bearerUserId(ok, new Headers({ authorization: 'Bearer good' }))).toBe('u1')
  })

  it('returns null without a header, with a bad token or when Supabase throws', async () => {
    expect(await bearerUserId(ok, new Headers())).toBeNull()
    expect(await bearerUserId(ok, new Headers({ authorization: 'Bearer nope' }))).toBeNull()
    expect(await bearerUserId(ok, new Headers({ authorization: 'Basic good' }))).toBeNull()
    expect(await bearerUserId(client(() => { throw new Error('down') }), new Headers({ authorization: 'Bearer good' }))).toBeNull()
  })
})

describe('waybillsUnlimited (5 → сразу Про: безлимит только с Kaspi Bot)', () => {
  const future = () => new Date(Date.now() + 10 * 86400_000).toISOString()
  const past = () => new Date(Date.now() - 10 * 86400_000).toISOString()
  // profile: строка профиля, 'error' — Postgrest вернул ошибку, 'throw' — запрос упал.
  const client = (profile: unknown, seen: { columns?: string; id?: unknown } = {}) =>
    ({
      auth: {
        getUser: async (token: string) =>
          token === 'good' ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } },
      },
      from: (table: string) => {
        expect(table).toBe('profiles')
        return {
          select: (columns: string) => {
            seen.columns = columns
            return {
              eq: (col: string, id: unknown) => {
                expect(col).toBe('id')
                seen.id = id
                return {
                  maybeSingle: async () => {
                    if (profile === 'throw') throw new Error('down')
                    if (profile === 'error') return { data: null, error: { message: 'boom' } }
                    return { data: profile, error: null }
                  },
                }
              },
            }
          },
        }
      },
    }) as unknown as SupabaseClient
  const signedIn = new Headers({ authorization: 'Bearer good' })

  it('is unlimited for an active Pro plan and for admins, reading the Kaspi Bot plan columns of the token owner', async () => {
    const seen: { columns?: string; id?: unknown } = {}
    expect(await waybillsUnlimited(client({ plan: 'pro', plan_expires_at: future() }, seen), signedIn)).toBe(true)
    expect(seen).toEqual({ columns: KASPI_SHOP_PROFILE_COLUMNS, id: 'u1' })
    expect(await waybillsUnlimited(client({ plan: 'free', is_admin: true }), signedIn)).toBe(true)
  })

  it('counts free, basic, trial and lapsed Pro accounts like anonymous visitors', async () => {
    expect(await waybillsUnlimited(client({ plan: 'free' }), signedIn)).toBe(false)
    expect(await waybillsUnlimited(client({ plan: 'basic', plan_expires_at: future() }), signedIn)).toBe(false)
    expect(await waybillsUnlimited(client({ plan: 'free', trial_expires_at: future() }), signedIn)).toBe(false)
    expect(await waybillsUnlimited(client({ plan: 'pro', plan_expires_at: past() }), signedIn)).toBe(false)
  })

  it('never grants unlimited without a valid session or when the profile cannot be read', async () => {
    const pro = { plan: 'pro' }
    expect(await waybillsUnlimited(client(pro), new Headers())).toBe(false)
    expect(await waybillsUnlimited(client(pro), new Headers({ authorization: 'Bearer nope' }))).toBe(false)
    expect(await waybillsUnlimited(client(null), signedIn)).toBe(false)
    expect(await waybillsUnlimited(client('error'), signedIn)).toBe(false)
    expect(await waybillsUnlimited(client('throw'), signedIn)).toBe(false)
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
      // readCounter: select('count').eq('key', k).maybeSingle()
      select: () => ({
        eq: (_col: string, k: string) => ({
          maybeSingle: async () => ({ data: k in rows ? { count: rows[k] } : null, error: null }),
        }),
      }),
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

describe('releaseCounterSlot (waybills: failed merge gives the slot back)', () => {
  it('decrements the claimed slot', async () => {
    const rows: Record<string, number> = { 'wb:a': 3 }
    expect(await releaseCounterSlot(fakeCounters(rows), 'wb:a', 3)).toBe(true)
    expect(rows['wb:a']).toBe(2)
  })

  it('re-reads and still decrements when a parallel merge moved the counter', async () => {
    const rows: Record<string, number> = { 'wb:b': 4 }
    expect(await releaseCounterSlot(fakeCounters(rows), 'wb:b', 3)).toBe(true)
    expect(rows['wb:b']).toBe(3)
  })

  it('never goes below zero and reports a database error', async () => {
    const rows: Record<string, number> = { 'wb:c': 0 }
    expect(await releaseCounterSlot(fakeCounters(rows), 'wb:c', 1)).toBe(true)
    expect(rows['wb:c']).toBe(0)
    expect(await releaseCounterSlot(fakeCounters({ 'wb:d': 1 }, { failUpdate: true }), 'wb:d', 1)).toBe(false)
  })

  it('a burst of parallel claims for one key lets exactly LIMIT through', async () => {
    const rows: Record<string, number> = {}
    const db = fakeCounters(rows)
    // Как в роуте: claim → на 'raced' перечитать → до LIMIT+1 попыток.
    const claimOne = async () => {
      let used = 0
      for (let attempt = 0; attempt <= WAYBILLS_MONTH_LIMIT; attempt++) {
        const c = await claimCounterSlot(db, 'wb:e', used)
        if (c === 'claimed') return true
        used = rows['wb:e'] ?? 0
        if (used >= WAYBILLS_MONTH_LIMIT) return false
      }
      return false
    }
    const results = await Promise.all(Array.from({ length: 10 }, claimOne))
    expect(results.filter(Boolean)).toHaveLength(WAYBILLS_MONTH_LIMIT)
    expect(rows['wb:e']).toBe(WAYBILLS_MONTH_LIMIT)
  })
})
