import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { performBinLookup } from './binLookupServer'
import { resetEnforcementState } from './binExtraChecks'

// Реабилитация (26.10.2026) в performBinLookup: проверка идёт только с extras,
// читается из нашей таблицы (без сети), undefined/null/состояния доезжают до
// company как есть. KGD, egov и Минюст подменены пустыми успешными ответами.

const BIN = '123456789012'
const FRESH = [{ fetched_at: new Date().toISOString() }]

interface RehabDb {
  fresh?: { fetched_at: string }[]
  row?: Record<string, unknown> | null
  error?: { code?: string; message?: string } | null
}

function fakeSupabase(cached: Record<string, unknown> | null, rehab: RehabDb) {
  const rehabCalls = vi.fn()
  const client = {
    from: (table: string) => {
      if (table === 'kgd_rehabilitation_debtors') {
        rehabCalls(table)
        return {
          select: (cols: string) =>
            cols === 'fetched_at'
              ? { order: () => ({ limit: async () => ({ data: rehab.fresh ?? [], error: rehab.error ?? null }) }) }
              : { eq: () => ({ maybeSingle: async () => ({ data: rehab.row ?? null, error: rehab.error ?? null }) }) },
        }
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cached }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
        upsert: async () => ({ error: null }),
      }
    },
  }
  return { client: client as never, rehabCalls }
}

const cachedRow = () => ({
  bin: BIN, name: 'ТОО Ромашка', address: null, director: null, activity: null, status: 'Зарегистрирован',
  registered_at: '2020-01-01', source: 'egov', is_vat_payer: true, vat_registered_at: '2021-01-01',
  is_unreliable: false, is_liquidating: false, total_arrear: 0, tax_arrear: 0, fetched_at: new Date().toISOString(),
})

const SOAP_EMPTY =
  '<r><responseInfo><status><code>SCSS001</code><message>Данные не найдены</message></status></responseInfo><responseData><data/></responseData></r>'
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 })

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input)
    if (url.includes('snr-search')) return ok({ status: 'SUCCESS', stmList: [] })
    if (url.includes('ODWebServiceImpl')) return new Response(SOAP_EMPTY, { status: 200 })
    if (url.includes('taxpayer-data/search')) return ok([])
    if (url.includes('gbd_ul')) return ok([{ bin: BIN, nameru: 'ТОО Ромашка', statusru: 'Зарегистрирован', datereg: '2020-01-01+06:00' }])
    if (url.includes('search-payer-data')) return new Response('', { status: 200 })
    if (url.includes('find-liquidated-taxpayer')) return ok({ taxpayers: { content: [] } })
    return new Response('{}', { status: 404 })
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.KGD_PORTAL_TOKEN = 'test-kgd-token'
  process.env.EGOV_API_KEY = 'test-egov-key'
  delete process.env.KGD_PERSONAL_ACCOUNT_TOKEN
  delete process.env.AISOIP_CHECK_DISABLED
  process.env.AISOIP_RETRY_DELAY_MS = '0'
  resetEnforcementState()
})
afterEach(() => {
  delete process.env.AISOIP_RETRY_DELAY_MS
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('performBinLookup with rehabilitation', () => {
  it('fresh lookup + extras, BIN absent from a fresh export: not_listed', async () => {
    const { client } = fakeSupabase(null, { fresh: FRESH, row: null })
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.rehabilitation).toEqual({ state: 'not_listed' })
  })

  it('cache hit + extras, BIN in the export: listed with date', async () => {
    const { client } = fakeSupabase(cachedRow(), {
      fresh: FRESH, row: { kind: 'rehabilitation', entry_force_date: '2024-06-07', region: 'город Астана' },
    })
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.rehabilitation).toEqual({ state: 'listed', since: '2024-06-07', region: 'город Астана' })
  })

  it('table missing: undefined, so the product behaves exactly as before the SQL', async () => {
    const { client } = fakeSupabase(cachedRow(), { error: { code: '42P01' } })
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.rehabilitation).toBeUndefined()
    // остальные проверки не пострадали
    expect(out.company.enforcement).toMatchObject({ found: false })
  })

  it('empty table (cron never ran): null, not a clean answer', async () => {
    const { client } = fakeSupabase(cachedRow(), { fresh: [], row: null })
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.rehabilitation).toBeNull()
  })

  it('a database failure is isolated: rehabilitation null, the other checks intact', async () => {
    const { client } = fakeSupabase(cachedRow(), { error: { code: '57014', message: 'timeout' } })
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.rehabilitation).toBeNull()
    expect(out.company.taxRegimes).not.toBeUndefined()
  })

  it('without extras the table is never read and the field stays unset', async () => {
    const { client, rehabCalls } = fakeSupabase(cachedRow(), { fresh: FRESH, row: null })
    const out = await performBinLookup(client, BIN)
    if (!out.found) throw new Error('expected found')
    expect(rehabCalls).not.toHaveBeenCalled()
    expect(out.company.rehabilitation).toBeUndefined()
  })
})
