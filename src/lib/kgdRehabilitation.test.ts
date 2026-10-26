import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fetchRehabilitation, isMissingRehabTable, mergeRehabilitationRows, parseIsoInstantToAlmatyDay,
  parseKgdDate, parseRehabilitationAll, parseRehabilitationTerminated, publicRehabilitation,
  REHAB_MAX_AGE_MS, type RehabilitationRow,
} from './kgdRehabilitation'

// Фикстуры сняты с живого ответа КГД 26.10.2026: форма и типы полей настоящие
// (debtors/all: debtorData + admin/directorData/founderData + entryForceDate
// 'DD.MM.YYYY' или null; debtors: debtorData + courtDecision{status,
// entryForceDate ISO}). Значения выдуманные, а персональные поля заполнены
// меткой PII-LEAK: тест проверяет, что она не доезжает до результата.

const BIN_A = '123456789012'
const BIN_B = '210987654321'
const BIN_C = '555555555555'

const rehabItem = (identifier: string, over: Record<string, unknown> = {}, debtorOver: Record<string, unknown> = {}) => ({
  debtorData: {
    identifier, rnn: null, debtorName: 'ТОО Тест', debtorNameRu: 'ТОО Тест', debtorNameKk: 'ТОО Тест',
    activityRu: null, activityKk: null, regionRu: 'город Астана', regionKk: 'Астана қаласы',
    procedureType: 'REHABILITATION', ...debtorOver,
  },
  admin: {
    email: 'PII-LEAK@example.com', firstName: 'PII-LEAK', lastName: 'PII-LEAK', middleName: 'PII-LEAK',
    fullName: 'PII-LEAK', phone: 'PII-LEAK', adminAddress: { nameRu: 'PII-LEAK', nameKk: 'PII-LEAK', nameQq: null, nameEn: null },
  },
  directorData: [{ memberType: 'DIRECTOR', identifier: '999999999999', lastName: 'PII-LEAK', firstName: 'PII-LEAK', middleName: null, name: null, nameRu: null, nameKk: null }],
  founderData: [{ memberType: 'FOUNDER', identifier: '888888888888', lastName: 'PII-LEAK', firstName: 'PII-LEAK', middleName: null, name: 'PII-LEAK', nameRu: null, nameKk: null }],
  entryForceDate: '07.06.2024',
  issueDate: '01.06.2024',
  ...over,
})

const termItem = (identifier: string, over: Record<string, unknown> = {}) => ({
  debtorData: {
    identifier, rnn: null, debtorName: 'ТОО Тест', debtorNameRu: 'ТОО Тест', debtorNameKk: 'ТОО Тест',
    activityRu: 'Деятельность', activityKk: 'Қызмет', regionRu: 'Кызылординская область', regionKk: 'Қызылорда облысы',
    procedureType: 'REHABILITATION',
  },
  debtorMembers: [{ memberType: 'DIRECTOR', identifier: '999999999999', lastName: 'PII-LEAK', firstName: 'PII-LEAK' }],
  caseAdminData: { type: 'ADMIN', identifier: '777777777777', adminName: 'PII-LEAK', phone: 'PII-LEAK', email: 'PII-LEAK', addressRu: 'PII-LEAK', addressKk: 'PII-LEAK' },
  courtDecision: { issueDate: '2024-08-06T19:00:00Z', entryForceDate: '2024-08-21T19:00:00Z', status: 'PROCEDURE_TERMINATED' },
  ...over,
})

const wrap = (response: unknown[]) => ({ header: { messageId: 'x', sender: 'invoices.kz' }, response })

describe('parseKgdDate', () => {
  it('converts DD.MM.YYYY to ISO', () => {
    expect(parseKgdDate('07.06.2024')).toBe('2024-06-07')
  })
  it('null, empty, garbage and impossible dates are null', () => {
    expect(parseKgdDate(null)).toBeNull()
    expect(parseKgdDate('')).toBeNull()
    expect(parseKgdDate('2024-06-07')).toBeNull()
    expect(parseKgdDate('31.02.2024')).toBeNull()
    expect(parseKgdDate(20240607)).toBeNull()
  })
})

describe('parseIsoInstantToAlmatyDay', () => {
  it('KGD midnight-Almaty instant (19:00Z) becomes the next calendar day, not the previous one', () => {
    expect(parseIsoInstantToAlmatyDay('2024-08-21T19:00:00Z')).toBe('2024-08-22')
  })
  it('garbage and null are null', () => {
    expect(parseIsoInstantToAlmatyDay(null)).toBeNull()
    expect(parseIsoInstantToAlmatyDay('not a date')).toBeNull()
  })
})

describe('parseRehabilitationAll', () => {
  it('reads the real response form into four fields and nothing personal', () => {
    const parsed = parseRehabilitationAll(wrap([rehabItem(BIN_A)]))
    expect(parsed).not.toBeNull()
    expect(parsed!.rows).toEqual([
      { identifier: BIN_A, kind: 'rehabilitation', name: 'ТОО Тест', entry_force_date: '2024-06-07', region: 'город Астана' },
    ])
    expect(JSON.stringify(parsed)).not.toContain('PII-LEAK')
    expect(JSON.stringify(parsed)).not.toContain('999999999999')
  })

  it('null entryForceDate stays a null date, the row is kept', () => {
    const parsed = parseRehabilitationAll(wrap([rehabItem(BIN_A, { entryForceDate: null })]))
    expect(parsed!.rows[0].entry_force_date).toBeNull()
  })

  it('falls back through name fields and region fields', () => {
    const parsed = parseRehabilitationAll(wrap([
      rehabItem(BIN_A, {}, { debtorNameRu: null, debtorName: 'Имя' }),
      rehabItem(BIN_B, {}, { debtorNameRu: null, debtorName: null, debtorNameKk: 'Аты', regionRu: null }),
    ]))
    expect(parsed!.rows[0].name).toBe('Имя')
    expect(parsed!.rows[1].name).toBe('Аты')
    expect(parsed!.rows[1].region).toBe('Астана қаласы')
  })

  it('skips records of another procedure type', () => {
    const parsed = parseRehabilitationAll(wrap([rehabItem(BIN_A, {}, { procedureType: 'BANKRUPTCY' }), rehabItem(BIN_B)]))
    expect(parsed!.rows.map(r => r.identifier)).toEqual([BIN_B])
  })

  it('an unexpected shape is null, not an empty list', () => {
    expect(parseRehabilitationAll(null)).toBeNull()
    expect(parseRehabilitationAll([])).toBeNull()
    expect(parseRehabilitationAll({})).toBeNull()
    expect(parseRehabilitationAll({ response: 'oops' })).toBeNull()
    expect(parseRehabilitationAll({ error: 'x' })).toBeNull()
  })

  it('too many records without a 12-digit identifier means the form changed: null', () => {
    const bad = Array.from({ length: 5 }, () => ({ debtorData: { identifier: 'abc' } }))
    const good = Array.from({ length: 5 }, (_, i) => rehabItem(String(100000000000 + i)))
    expect(parseRehabilitationAll(wrap([...bad, ...good]))).toBeNull()
  })

  it('a stray bad record among many is tolerated and counted', () => {
    const good = Array.from({ length: 30 }, (_, i) => rehabItem(String(100000000000 + i)))
    const parsed = parseRehabilitationAll(wrap([...good, { debtorData: { identifier: 'abc' } }]))
    expect(parsed!.rows).toHaveLength(30)
    expect(parsed!.malformed).toBe(1)
  })

  it('an empty response array is a valid, empty list (the sync decides if that is plausible)', () => {
    expect(parseRehabilitationAll(wrap([]))).toEqual({ rows: [], malformed: 0 })
  })
})

describe('parseRehabilitationTerminated', () => {
  it('reads the real form, converts the decision instant to the Almaty day, drops personal data', () => {
    const parsed = parseRehabilitationTerminated(wrap([termItem(BIN_A)]))
    expect(parsed!.rows).toEqual([
      { identifier: BIN_A, kind: 'terminated', name: 'ТОО Тест', entry_force_date: '2024-08-22', region: 'Кызылординская область' },
    ])
    expect(JSON.stringify(parsed)).not.toContain('PII-LEAK')
  })

  it('a null decision date keeps the row with a null date', () => {
    const parsed = parseRehabilitationTerminated(wrap([
      termItem(BIN_A, { courtDecision: { issueDate: null, entryForceDate: null, status: 'PROCEDURE_TERMINATED' } }),
    ]))
    expect(parsed!.rows[0].entry_force_date).toBeNull()
  })

  it('ignores records whose court decision status is not PROCEDURE_TERMINATED', () => {
    const parsed = parseRehabilitationTerminated(wrap([
      termItem(BIN_A, { courtDecision: { status: 'SOMETHING_ELSE', entryForceDate: '2024-08-21T19:00:00Z' } }),
      termItem(BIN_B),
    ]))
    expect(parsed!.rows.map(r => r.identifier)).toEqual([BIN_B])
  })

  it('an unexpected shape is null', () => {
    expect(parseRehabilitationTerminated({ response: {} })).toBeNull()
    expect(parseRehabilitationTerminated('html')).toBeNull()
  })
})

const row = (identifier: string, kind: RehabilitationRow['kind'], date: string | null): RehabilitationRow =>
  ({ identifier, kind, name: 'ТОО', entry_force_date: date, region: 'Астана' })

describe('mergeRehabilitationRows', () => {
  it('a BIN only in the rehabilitation list is rehabilitation, only in the terminated list is terminated', () => {
    const out = mergeRehabilitationRows([row(BIN_A, 'rehabilitation', '2024-01-01')], [row(BIN_B, 'terminated', '2024-05-05')])
    expect(out.find(r => r.identifier === BIN_A)!.kind).toBe('rehabilitation')
    expect(out.find(r => r.identifier === BIN_B)!.kind).toBe('terminated')
  })

  it('termination later than the procedure entry wins (real data: the all-list lags behind courts)', () => {
    const out = mergeRehabilitationRows([row(BIN_A, 'rehabilitation', '2021-05-20')], [row(BIN_A, 'terminated', '2024-08-22')])
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('terminated')
  })

  it('a procedure newer than the termination stays rehabilitation', () => {
    const out = mergeRehabilitationRows([row(BIN_A, 'rehabilitation', '2025-03-01')], [row(BIN_A, 'terminated', '2024-08-22')])
    expect(out[0].kind).toBe('rehabilitation')
  })

  it('an unknown date on either side keeps rehabilitation (the cautious side)', () => {
    expect(mergeRehabilitationRows([row(BIN_A, 'rehabilitation', null)], [row(BIN_A, 'terminated', '2024-08-22')])[0].kind).toBe('rehabilitation')
    expect(mergeRehabilitationRows([row(BIN_A, 'rehabilitation', '2021-01-01')], [row(BIN_A, 'terminated', null)])[0].kind).toBe('rehabilitation')
  })

  it('duplicates inside one list collapse to one row, the dated and latest one', () => {
    const out = mergeRehabilitationRows([
      row(BIN_A, 'rehabilitation', null),
      row(BIN_A, 'rehabilitation', '2020-05-20'),
      row(BIN_A, 'rehabilitation', '2022-01-01'),
      row(BIN_C, 'rehabilitation', '2020-05-20'),
      row(BIN_C, 'rehabilitation', '2020-05-20'),
    ], [])
    expect(out).toHaveLength(2)
    expect(out.find(r => r.identifier === BIN_A)!.entry_force_date).toBe('2022-01-01')
  })
})

describe('isMissingRehabTable', () => {
  it('recognises Postgres and PostgREST missing-table errors', () => {
    expect(isMissingRehabTable({ code: '42P01' })).toBe(true)
    expect(isMissingRehabTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingRehabTable({ message: 'relation "public.kgd_rehabilitation_debtors" does not exist' })).toBe(true)
    expect(isMissingRehabTable({ message: 'Could not find the table in the schema cache' })).toBe(true)
  })
  it('other errors and no error are not "missing"', () => {
    expect(isMissingRehabTable({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isMissingRehabTable(null)).toBe(false)
  })
})

type Err = { code?: string; message?: string } | null
function fakeDb(opts: { fresh?: { fetched_at: string }[] | null; row?: Record<string, unknown> | null; freshError?: Err; rowError?: Err }) {
  return {
    from: () => ({
      select: (cols: string) =>
        cols === 'fetched_at'
          ? { order: () => ({ limit: async () => ({ data: opts.fresh ?? [], error: opts.freshError ?? null }) }) }
          : { eq: () => ({ maybeSingle: async () => ({ data: opts.row ?? null, error: opts.rowError ?? null }) }) },
    }),
  } as never
}

const NOW = Date.parse('2026-10-26T12:00:00Z')
const FRESH = [{ fetched_at: '2026-10-26T02:00:05Z' }]

describe('fetchRehabilitation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('undefined (feature not enabled) when the table does not exist, for both Postgres and PostgREST codes', async () => {
    expect(await fetchRehabilitation(fakeDb({ freshError: { code: '42P01' }, rowError: { code: '42P01' } }), BIN_A, NOW)).toBeUndefined()
    expect(await fetchRehabilitation(fakeDb({ freshError: { code: 'PGRST205' }, rowError: { code: 'PGRST205' } }), BIN_A, NOW)).toBeUndefined()
    expect(await fetchRehabilitation(fakeDb({ rowError: { message: 'relation "x" does not exist' } }), BIN_A, NOW)).toBeUndefined()
  })

  it('null (not checked) for an empty table: the cron has not run yet', async () => {
    expect(await fetchRehabilitation(fakeDb({ fresh: [], row: null }), BIN_A, NOW)).toBeNull()
  })

  it('null when the export is older than three days, even if the BIN is absent', async () => {
    const stale = [{ fetched_at: new Date(NOW - REHAB_MAX_AGE_MS - 60_000).toISOString() }]
    expect(await fetchRehabilitation(fakeDb({ fresh: stale, row: null }), BIN_A, NOW)).toBeNull()
  })

  it('still answers when the export is just under three days old', async () => {
    const ok = [{ fetched_at: new Date(NOW - REHAB_MAX_AGE_MS + 60_000).toISOString() }]
    expect(await fetchRehabilitation(fakeDb({ fresh: ok, row: null }), BIN_A, NOW)).toEqual({ state: 'not_listed' })
  })

  it('null on an ordinary query error and on a thrown exception', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await fetchRehabilitation(fakeDb({ fresh: FRESH, rowError: { code: '57014', message: 'timeout' } }), BIN_A, NOW)).toBeNull()
    const throwing = { from: () => { throw new Error('boom') } } as never
    expect(await fetchRehabilitation(throwing, BIN_A, NOW)).toBeNull()
  })

  it('not_listed for a fresh export without the BIN', async () => {
    expect(await fetchRehabilitation(fakeDb({ fresh: FRESH, row: null }), BIN_A, NOW)).toEqual({ state: 'not_listed' })
  })

  it('listed with the date and region for a rehabilitation row', async () => {
    const r = await fetchRehabilitation(
      fakeDb({ fresh: FRESH, row: { kind: 'rehabilitation', entry_force_date: '2024-06-07', region: 'город Астана' } }), BIN_A, NOW)
    expect(r).toEqual({ state: 'listed', since: '2024-06-07', region: 'город Астана' })
  })

  it('listed without a date keeps since null', async () => {
    const r = await fetchRehabilitation(fakeDb({ fresh: FRESH, row: { kind: 'rehabilitation', entry_force_date: null, region: null } }), BIN_A, NOW)
    expect(r).toEqual({ state: 'listed', since: null, region: null })
  })

  it('terminated for a terminated row', async () => {
    const r = await fetchRehabilitation(fakeDb({ fresh: FRESH, row: { kind: 'terminated', entry_force_date: '2024-08-22', region: 'Астана' } }), BIN_A, NOW)
    expect(r?.state).toBe('terminated')
  })

  it('an unknown kind in the table is not "clean": null', async () => {
    expect(await fetchRehabilitation(fakeDb({ fresh: FRESH, row: { kind: 'weird' } }), BIN_A, NOW)).toBeNull()
  })

  it('an invalid BIN is null without touching the database', async () => {
    const db = { from: vi.fn() } as never
    expect(await fetchRehabilitation(db, '123', NOW)).toBeNull()
    expect((db as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })
})

describe('publicRehabilitation (whitelist)', () => {
  it('keeps undefined and null distinct', () => {
    expect(publicRehabilitation(undefined)).toBeUndefined()
    expect(publicRehabilitation(null)).toBeNull()
  })
  it('drops everything except state, since and region', () => {
    const dirty = { state: 'listed', since: '2024-06-07', region: 'Астана', name: 'ТОО Секрет', identifier: BIN_A, admin: 'PII-LEAK' } as never
    expect(publicRehabilitation(dirty)).toEqual({ state: 'listed', since: '2024-06-07', region: 'Астана' })
  })
  it('an unknown state becomes null (not checked), never a clean answer', () => {
    expect(publicRehabilitation({ state: 'clean' } as never)).toBeNull()
  })
  it('a malformed since is dropped', () => {
    expect(publicRehabilitation({ state: 'listed', since: '07.06.2024' })!.since).toBeNull()
  })
})
