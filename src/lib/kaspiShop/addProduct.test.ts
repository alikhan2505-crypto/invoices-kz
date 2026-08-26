import { describe, it, expect, vi } from 'vitest'
import {
  searchCatalogProducts,
  generateSkuSuffix,
  getLowestPrice,
  getMerchantPoints,
  addProductToExistingCard,
} from './addProduct'

function jsonResponse(body: any, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('searchCatalogProducts', () => {
  it('sends the x-merchant header and maps the captured response shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      products: [{
        id: '165601653',
        title: 'Влажные полотенца Sunlight Baby Fish 70 шт',
        categoryId: '03215',
        previewImages: [{ small: 's', medium: 'm', large: 'l' }],
        shopLink: '/p/x-165601653/?c=750000000',
        hasVariants: false,
        categoryRu: ['Товары для дома и дачи', 'Влажные салфетки'],
      }],
      pageSize: 12,
      total: 260468,
    }))
    const result = await searchCatalogProducts('cookie=1', '30067228', 'baby fish', fetchFn as any)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/product/view/mc/products?text=baby%20fish')
    expect(init.headers['x-merchant']).toBe('30067228')
    expect(result.sessionExpired).toBe(false)
    expect(result.total).toBe(260468)
    expect(result.products).toEqual([{
      id: '165601653',
      title: 'Влажные полотенца Sunlight Baby Fish 70 шт',
      categoryName: 'Влажные салфетки',
      imageUrl: 'm',
      shopLink: '/p/x-165601653/?c=750000000',
    }])
  })

  it('reports sessionExpired on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const result = await searchCatalogProducts('cookie=1', '30067228', 'x', fetchFn as any)
    expect(result.sessionExpired).toBe(true)
    expect(result.products).toEqual([])
  })
})

describe('generateSkuSuffix', () => {
  it('returns the bare numeric body Kaspi sends', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse('465140475'))
    expect(await generateSkuSuffix('c', '30067228', fetchFn as any)).toBe('465140475')
  })

  it('falls back to a generated digit string when the endpoint fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 500))
    const suffix = await generateSkuSuffix('c', '30067228', fetchFn as any)
    expect(suffix).toMatch(/^\d{9}$/)
  })
})

describe('getLowestPrice', () => {
  it('parses {"price":1200.0}', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ price: 1200.0 }))
    expect(await getLowestPrice('c', '165601653', fetchFn as any)).toBe(1200)
  })

  it('returns null on any failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 404))
    expect(await getLowestPrice('c', 'x', fetchFn as any)).toBeNull()
  })
})

describe('getMerchantPoints', () => {
  it('maps cities with their active points, keeping bare store codes', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([
      {
        id: '511010000', name: 'Шымкент',
        pickupPoints: [{ name: '30067228_PP2', displayName: 'PP2', active: true }],
      },
      {
        id: '710000000', name: 'Астана',
        pickupPoints: [
          { name: '30067228_PP1', displayName: 'PP1', active: true },
          { name: '30067228_PP9', displayName: 'PP9', active: false },
        ],
      },
    ]))
    const result = await getMerchantPoints('c', '30067228', fetchFn as any)
    expect(result.cities).toEqual([
      { cityId: '511010000', cityName: 'Шымкент', points: [{ storeCode: 'PP2', displayName: 'PP2' }] },
      { cityId: '710000000', cityName: 'Астана', points: [{ storeCode: 'PP1', displayName: 'PP1' }] },
    ])
  })
})

const addParams = {
  sessionCookies: 'cookie=1',
  merchantId: '30067228',
  masterProductCode: '165601653',
  sku: '165601653_465140475',
  model: 'Влажные полотенца Sunlight Baby Fish 70 шт',
  cityPrices: [{ cityId: '511010000', value: 1200 }],
  availabilities: [{ storeCode: 'PP2', stockCount: 4 }],
}

describe('addProductToExistingCard', () => {
  it('runs validate -> link-to-master -> pricefeed process with the exact captured bodies', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ merchantUid: '30067228', valid: true, errorOffers: null }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
    const result = await addProductToExistingCard({ ...addParams }, fetchFn as any)
    expect(result).toEqual({ success: true })

    const [validateUrl, validateInit] = fetchFn.mock.calls[0]
    expect(validateUrl).toContain('/offer-validation-api/merchant/offer/validate/v2')
    expect(JSON.parse(validateInit.body)).toEqual({
      action: 'LINK__TO_MASTER_CHOOSE',
      merchantUid: '30067228',
      offers: [{ masterSku: '165601653' }],
    })

    const [linkUrl, linkInit] = fetchFn.mock.calls[1]
    expect(linkUrl).toContain('/content/pending/mc/product/link-to-master')
    expect(JSON.parse(linkInit.body)).toEqual({
      merchantCode: '30067228',
      merchantProductCode: '165601653_465140475',
      masterProductCode: '165601653',
    })

    const [processUrl, processInit] = fetchFn.mock.calls[2]
    expect(processUrl).toContain('/pricefeed/upload/merchant/process')
    expect(JSON.parse(processInit.body)).toEqual({
      cityPrices: [{ cityId: '511010000', value: 1200 }],
      availabilities: [{ available: 'yes', storeId: '30067228_PP2', stockCount: 4 }],
      merchantUid: '30067228',
      sku: '165601653_465140475',
      model: 'Влажные полотенца Sunlight Baby Fish 70 шт',
      brand: '',
    })
  })

  it('omits stockCount when it is null (cabinet leaves the field out entirely)', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ valid: true }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
    await addProductToExistingCard(
      { ...addParams, availabilities: [{ storeCode: 'PP2', stockCount: null }] },
      fetchFn as any
    )
    const processBody = JSON.parse(fetchFn.mock.calls[2][1].body)
    expect(processBody.availabilities).toEqual([{ available: 'yes', storeId: '30067228_PP2' }])
  })

  it('aborts before link-to-master on explicit valid:false', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({ valid: false, errorOffers: [{ masterSku: '165601653', message: 'bad' }] })
    )
    const result = await addProductToExistingCard({ ...addParams }, fetchFn as any)
    expect(result.success).toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('continues past a validation hiccup that is not an explicit valid:false', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
    const result = await addProductToExistingCard({ ...addParams }, fetchFn as any)
    expect(result).toEqual({ success: true })
  })

  it('maps 401 to session_expired', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({}, 401))
    const result = await addProductToExistingCard({ ...addParams }, fetchFn as any)
    expect(result).toEqual(expect.objectContaining({ success: false, reason: 'session_expired' }))
  })

  it('fails when link-to-master is rejected', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ valid: true }))
      .mockResolvedValueOnce(new Response('nope', { status: 400 }))
    const result = await addProductToExistingCard({ ...addParams }, fetchFn as any)
    expect(result.success).toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
