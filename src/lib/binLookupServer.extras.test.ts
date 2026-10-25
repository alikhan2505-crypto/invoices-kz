import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { performBinLookup } from './binLookupServer'
import { resetEnforcementState } from './binExtraChecks'

// performBinLookup с extras: проверяем изоляцию (сбой одной проверки не ломает
// остальные), что null остаётся null, и что без extras новые запросы не уходят.
// Supabase и fetch подменены, живой сети нет.

const BIN = '123456789012'

const fakeSupabase = (cached: Record<string, unknown> | null) => {
  const update = vi.fn(() => ({ eq: async () => ({ error: null }) }))
  const upsert = vi.fn(async () => ({ error: null }))
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cached }) }) }),
      update,
      upsert,
    }),
  }
  return { client: client as never, update, upsert }
}

const cachedRow = (over: Record<string, unknown> = {}) => ({
  bin: BIN, name: 'ТОО Ромашка', address: null, director: null, activity: null, status: 'Зарегистрирован',
  registered_at: '2020-01-01', source: 'egov', is_vat_payer: true, vat_registered_at: '2021-01-01',
  is_unreliable: false, is_liquidating: false, total_arrear: 0, tax_arrear: 0,
  fetched_at: new Date().toISOString(), ...over,
})

const SOAP_EMPTY =
  '<r><responseInfo><status><code>SCSS001</code><message>Данные не найдены</message></status></responseInfo><responseData><data/></responseData></r>'

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>
let calls: string[]
let handlers: { unreliable: Handler; snr: Handler; soap: Handler }

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 })

beforeEach(() => {
  calls = []
  handlers = {
    unreliable: () => ok([]),
    snr: () => ok({ status: 'SUCCESS', stmList: [{ type: 'SNR_GENERAL_ORDER', typeNameRu: 'Общеустановленный порядок' }] }),
    soap: () => new Response(SOAP_EMPTY, { status: 200 }),
  }
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('snr-search')) { calls.push('snr'); return handlers.snr(url, init) }
    if (url.includes('ODWebServiceImpl')) { calls.push('soap'); return handlers.soap(url, init) }
    if (url.includes('taxpayer-data/search')) { calls.push('unreliable'); return handlers.unreliable(url, init) }
    if (url.includes('gbd_ul')) {
      return ok([{ bin: BIN, nameru: 'ТОО Ромашка', statusru: 'Зарегистрирован', datereg: '2020-01-01+06:00' }])
    }
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

describe('performBinLookup, fresh lookup with extras', () => {
  it('fills categories, regime and enforcement next to the old risk fields', async () => {
    handlers.unreliable = () => ok([{ taxpayerDataList: [{ unreliableTaxpayerDataCategory: 'BANKRUPT_LIST' }] }])
    const { client, upsert } = fakeSupabase(null)
    const out = await performBinLookup(client, BIN, { extras: true })
    expect(out.found).toBe(true)
    if (!out.found) return
    expect(out.company.isUnreliable).toBe(true)
    expect(out.company.unreliableCategories).toEqual(['bankrupt'])
    expect(out.company.taxRegimes?.[0].type).toBe('SNR_GENERAL_ORDER')
    expect(out.company.enforcement).toMatchObject({ found: false, count: 0 })
    // Список неблагонадёжных спрошен один раз: категории пришли вместе с флагом.
    expect(calls.filter(c => c === 'unreliable')).toHaveLength(1)
    // Новые поля в таблицу кэша не пишутся (схему не меняли).
    const written = (upsert.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(Object.keys(written)).not.toContain('unreliableCategories')
    expect(Object.keys(written)).not.toContain('enforcement')
    expect(Object.keys(written)).not.toContain('taxRegimes')
  })

  it('a failing registry of debtors does not break the others: enforcement null, the rest intact', async () => {
    handlers.soap = () => new Response('<html>403 Forbidden</html>', { status: 403 })
    const { client } = fakeSupabase(null)
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.enforcement).toBeNull()
    expect(out.company.taxRegimes).not.toBeNull()
    expect(out.company.isUnreliable).toBe(false)
    expect(out.company.unreliableCategories).toEqual([])
  })

  it('a failing tax regime service does not break the others: taxRegimes null', async () => {
    handlers.snr = () => new Response('boom', { status: 500 })
    const { client } = fakeSupabase(null)
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.taxRegimes).toBeNull()
    expect(out.company.enforcement).toMatchObject({ found: false })
  })

  it('failed unreliable list: flag null and categories null, never an empty "clean" list', async () => {
    handlers.unreliable = () => new Response('nope', { status: 503 })
    const { client } = fakeSupabase(null)
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.isUnreliable).toBeNull()
    expect(out.company.unreliableCategories).toBeNull()
  })

  it('without extras no new request is made and the new fields stay unset', async () => {
    const { client } = fakeSupabase(null)
    const out = await performBinLookup(client, BIN)
    if (!out.found) throw new Error('expected found')
    expect(calls).not.toContain('snr')
    expect(calls).not.toContain('soap')
    expect(out.company.taxRegimes).toBeUndefined()
    expect(out.company.enforcement).toBeUndefined()
    expect(out.company.unreliableCategories).toBeUndefined()
  })
})

describe('performBinLookup, cache hit with extras', () => {
  it('listed in the cache: the list is re-read for its categories', async () => {
    handlers.unreliable = () => ok([{ taxpayerDataList: [{ unreliableTaxpayerDataCategory: 'INACTIVE_LIST' }] }])
    const { client } = fakeSupabase(cachedRow({ is_unreliable: true }))
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.unreliableCategories).toEqual(['inactive'])
    expect(calls.filter(c => c === 'unreliable')).toHaveLength(1)
    expect(calls).toContain('snr')
    expect(calls).toContain('soap')
  })

  it('listed in the cache but the re-read fails: categories null (unknown), flag kept', async () => {
    handlers.unreliable = () => new Response('', { status: 500 })
    const { client } = fakeSupabase(cachedRow({ is_unreliable: true }))
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.isUnreliable).toBe(true)
    expect(out.company.unreliableCategories).toBeNull()
  })

  it('not listed in the cache: no categories to look up, the list is not called again', async () => {
    const { client } = fakeSupabase(cachedRow({ is_unreliable: false }))
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.unreliableCategories).toEqual([])
    expect(calls).not.toContain('unreliable')
    expect(calls).toContain('snr')
    expect(calls).toContain('soap')
  })

  it('unreliable unknown in the cache stays unknown (null), not an empty list', async () => {
    handlers.unreliable = () => new Response('', { status: 500 })
    const { client } = fakeSupabase(cachedRow({ is_unreliable: null }))
    const out = await performBinLookup(client, BIN, { extras: true })
    if (!out.found) throw new Error('expected found')
    expect(out.company.isUnreliable).toBeNull()
    expect(out.company.unreliableCategories).toBeNull()
  })

  it('cache hit without extras is as before: no extra requests', async () => {
    const { client } = fakeSupabase(cachedRow())
    await performBinLookup(client, BIN)
    expect(calls).toEqual([])
  })
})
