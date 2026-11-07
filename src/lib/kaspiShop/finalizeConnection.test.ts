import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>
const { tables, updates, inserts, listCatalogWithStatus, fetchOffersDetailsChecked } = vi.hoisted(() => ({
  tables: { tracked: [] as Row[] },
  updates: [] as Row[],
  inserts: [] as Row[],
  listCatalogWithStatus: vi.fn(),
  fetchOffersDetailsChecked: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== 'kaspi_shop_tracked_products') {
        return { update: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) }
      }
      return {
        select: () => {
          const q: any = { _sku: null }
          q.eq = (col: string, val: any) => { if (col === 'kaspi_master_sku') q._sku = val; return q }
          q.maybeSingle = async () => {
            const found = tables.tracked.find(r => r.kaspi_master_sku === q._sku)
            return { data: found ? { id: found.id } : null, error: null }
          }
          return q
        },
        update: (payload: Row) => ({ eq: async () => { updates.push(payload); return { error: null } } }),
        insert: (payload: Row) => ({
          select: () => ({ single: async () => { inserts.push(payload); return { data: { id: 'new-' + inserts.length }, error: null } } }),
        }),
      }
    },
  }),
}))
vi.mock('./cabinetApi', () => ({
  listCatalogWithStatus: (...a: unknown[]) => listCatalogWithStatus(...a),
  fetchOffersDetailsChecked: (...a: unknown[]) => fetchOffersDetailsChecked(...a),
  fetchCityNames: async () => ({}),
  extractOfferPointInfo: (item: any) => (item.cities || []).map((c: any) => ({ storeCode: 'PP1', cityId: c.cityId })),
  totalStock: () => 0,
}))
vi.mock('./connection', () => ({ saveConnection: vi.fn(), loadConnectionByMerchant: vi.fn() }))

import { importCatalogProducts } from './finalizeConnection'

function offer(sku: string, masterSku = `M${sku}`) {
  return { sku, masterSku, title: sku, brandCode: null, brandName: null, masterCategory: null, minPrice: 100, allCityPrices: {}, points: ['PP1'], availabilities: [] }
}
const okList = (offers: any[]) => ({ offers, sessionExpired: false, complete: true, failed: false })

beforeEach(() => {
  vi.clearAllMocks()
  tables.tracked.length = 0
  updates.length = 0
  inserts.length = 0
})

describe('importCatalogProducts: point_city_codes (K23)', () => {
  it('does NOT overwrite point_city_codes of an existing product when the details batch failed', async () => {
    tables.tracked.push({ id: 't1', kaspi_master_sku: 'Ma' })
    listCatalogWithStatus.mockResolvedValue(okList([offer('a')]))
    fetchOffersDetailsChecked.mockResolvedValue({ items: [], okSkus: new Set(), ok: false, sessionExpired: false })
    const result = await importCatalogProducts('conn', 'user', 'cookie', 'm')
    expect(updates).toHaveLength(1)
    expect('point_city_codes' in updates[0]).toBe(false)
    expect(result.pointCitiesPartial).toBe(true)
    expect(result.imported).toBe(1)
  })

  it('writes point_city_codes only for the skus whose details came back', async () => {
    tables.tracked.push({ id: 't1', kaspi_master_sku: 'Ma' }, { id: 't2', kaspi_master_sku: 'Mb' })
    listCatalogWithStatus.mockResolvedValue(okList([offer('a'), offer('b')]))
    fetchOffersDetailsChecked.mockResolvedValue({
      items: [{ sku: 'a', cities: [{ cityId: '511010000' }] }],
      okSkus: new Set(['a']), ok: false, sessionExpired: false,
    })
    await importCatalogProducts('conn', 'user', 'cookie', 'm')
    const withCities = updates.filter(u => 'point_city_codes' in u)
    expect(withCities).toHaveLength(1)
    expect(withCities[0].point_city_codes).toEqual(['511010000'])
  })

  it('refreshes point_city_codes when the details batch succeeded', async () => {
    tables.tracked.push({ id: 't1', kaspi_master_sku: 'Ma' })
    listCatalogWithStatus.mockResolvedValue(okList([offer('a')]))
    fetchOffersDetailsChecked.mockResolvedValue({ items: [{ sku: 'a', cities: [{ cityId: '1' }] }], okSkus: new Set(['a']), ok: true, sessionExpired: false })
    const result = await importCatalogProducts('conn', 'user', 'cookie', 'm')
    expect(updates[0].point_city_codes).toEqual(['1'])
    expect(result.pointCitiesPartial).toBe(false)
  })

  it('a NEW product is inserted with an empty list when details failed (nothing to lose)', async () => {
    listCatalogWithStatus.mockResolvedValue(okList([offer('a')]))
    fetchOffersDetailsChecked.mockResolvedValue({ items: [], okSkus: new Set(), ok: false, sessionExpired: false })
    await importCatalogProducts('conn', 'user', 'cookie', 'm')
    expect(inserts[0].point_city_codes).toEqual([])
  })
})

describe('importCatalogProducts: result honesty (K22)', () => {
  it('a dead session is sessionExpired, not "imported 0" success', async () => {
    listCatalogWithStatus.mockResolvedValue({ offers: [], sessionExpired: true, complete: false, failed: true, error: 'Сессия кабинета Kaspi истекла' })
    const result = await importCatalogProducts('conn', 'user', 'cookie', 'm')
    expect(result).toMatchObject({ imported: 0, complete: false, sessionExpired: true })
    expect(fetchOffersDetailsChecked).not.toHaveBeenCalled()
  })

  it('a Kaspi failure on page 0 is incomplete with an error (not 0 of 0 complete)', async () => {
    listCatalogWithStatus.mockResolvedValue({ offers: [], sessionExpired: false, complete: false, failed: true, error: 'Kaspi ответил HTTP 429' })
    fetchOffersDetailsChecked.mockResolvedValue({ items: [], okSkus: new Set(), ok: true, sessionExpired: false })
    const result = await importCatalogProducts('conn', 'user', 'cookie', 'm')
    expect(result).toMatchObject({ imported: 0, complete: false, sessionExpired: false, error: 'Kaspi ответил HTTP 429' })
  })

  it('a catalog cut off mid-way imports what was read but is never complete', async () => {
    listCatalogWithStatus.mockResolvedValue({ offers: [offer('a')], sessionExpired: false, complete: false, failed: true, error: 'Kaspi ответил HTTP 500' })
    fetchOffersDetailsChecked.mockResolvedValue({ items: [], okSkus: new Set(), ok: true, sessionExpired: false })
    const result = await importCatalogProducts('conn', 'user', 'cookie', 'm')
    expect(result.imported).toBe(1)
    expect(result.total).toBe(0) // неизвестно: прочитанный кусок не общее число товаров
    expect(result.complete).toBe(false)
  })

  it('a clean full run is complete', async () => {
    listCatalogWithStatus.mockResolvedValue(okList([offer('a'), offer('b')]))
    fetchOffersDetailsChecked.mockResolvedValue({ items: [], okSkus: new Set(), ok: true, sessionExpired: false })
    const result = await importCatalogProducts('conn', 'user', 'cookie', 'm')
    expect(result).toMatchObject({ imported: 2, total: 2, skipped: 0, complete: true, sessionExpired: false })
  })
})

describe('importCatalogProducts: total при оборванном списке', () => {
  it('список оборвался: imported есть, а total неизвестен (0), чтобы не писать «из N» по прочитанному куску', async () => {
    listCatalogWithStatus.mockResolvedValue({ offers: [offer('a'), offer('b')], sessionExpired: false, complete: false, failed: false, error: 'Kaspi ответил HTTP 500' })
    fetchOffersDetailsChecked.mockResolvedValue({ items: [], okSkus: new Set(), ok: true, sessionExpired: false })
    const result = await importCatalogProducts('conn', 'user', 'cookie', 'm')
    expect(result.imported).toBe(2)
    expect(result.complete).toBe(false)
    expect(result.total).toBe(0)
  })

  it('список полный: total = сколько вернул Kaspi', async () => {
    listCatalogWithStatus.mockResolvedValue(okList([offer('a'), offer('b'), offer('c')]))
    fetchOffersDetailsChecked.mockResolvedValue({ items: [], okSkus: new Set(), ok: true, sessionExpired: false })
    const result = await importCatalogProducts('conn', 'user', 'cookie', 'm')
    expect(result).toMatchObject({ imported: 3, total: 3, complete: true })
  })
})
