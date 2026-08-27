import { describe, it, expect, vi } from 'vitest'
import {
  getCategoryChildren,
  searchBrands,
  findNoBrandOption,
  getCategoryAttributeSchema,
  uploadProductPhoto,
  generateProductName,
  createNewProductCard,
  type ClassificationGroup,
} from './addProductNewCard'

function jsonResponse(body: any, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('getCategoryChildren', () => {
  it('fetches the root when parentCode is null', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([
      { code: 'Toys', name: 'Игрушки', hasContentChild: true, image: { formatToUrlMap: { ORIGINAL: 'https://x/y.png' } }, closed: false },
    ]))
    const result = await getCategoryChildren('cookie=1', '30067228', null, fetchFn as any)
    expect(fetchFn.mock.calls[0][0]).toBe('https://mc.shop.kaspi.kz/product/classification/mc/category/all?m=30067228')
    expect(result.categories).toEqual([
      { code: 'Toys', name: 'Игрушки', hasChildren: true, closed: false, imageUrl: 'https://x/y.png' },
    ])
  })

  it('fetches children with the c= param when parentCode is given', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([
      { code: 'Master - Educational toys', name: 'Развивающие игрушки', hasContentChild: false, image: null, closed: false },
    ]))
    const result = await getCategoryChildren('cookie=1', '30067228', 'Toys', fetchFn as any)
    expect(fetchFn.mock.calls[0][0]).toBe('https://mc.shop.kaspi.kz/product/classification/mc/category/all?c=Toys&m=30067228')
    expect(result.categories[0]).toEqual({
      code: 'Master - Educational toys', name: 'Развивающие игрушки', hasChildren: false, closed: false, imageUrl: null,
    })
  })

  it('marks closed/restricted categories', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([
      { code: 'Master - Subscriptions for children', name: 'Абонементы', hasContentChild: false, image: null, closed: true, restrictionType: 'CLOSED' },
    ]))
    const result = await getCategoryChildren('c', '30067228', 'Child goods', fetchFn as any)
    expect(result.categories[0].closed).toBe(true)
  })

  it('reports sessionExpired on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const result = await getCategoryChildren('c', '30067228', null, fetchFn as any)
    expect(result.sessionExpired).toBe(true)
    expect(result.categories).toEqual([])
  })
})

describe('searchBrands + findNoBrandOption', () => {
  it('maps the {data,total,pageCount} response and resolves «Без бренда» by exact name', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { code: 'china-toys', name: 'Без бренда', restrictionType: null, restricted: false, closed: false, personal: false },
        { code: '1toy', name: '1TOY', restrictionType: null, restricted: false, closed: false, personal: false },
        { code: '2buy-kz', name: '2buy.kz', restrictionType: 'RESTRICTED', restricted: true, closed: false, personal: false },
      ],
      total: 13723,
      pageCount: 687,
    }))
    const result = await searchBrands('c', '30067228', 'Master - Educational toys', '', fetchFn as any)
    const [url] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/product/brands/mc/brand/find?c=Master%20-%20Educational%20toys&p=0&name=&s=20&m=30067228')
    expect(result.brands).toEqual([
      { code: 'china-toys', name: 'Без бренда', restricted: false },
      { code: '1toy', name: '1TOY', restricted: false },
      { code: '2buy-kz', name: '2buy.kz', restricted: true },
    ])
    expect(findNoBrandOption(result.brands)).toEqual({ code: 'china-toys', name: 'Без бренда', restricted: false })
  })

  it('findNoBrandOption returns null when absent (never falls back to position/hardcoding)', () => {
    expect(findNoBrandOption([{ code: '1toy', name: '1TOY', restricted: false }])).toBeNull()
  })
})

describe('getCategoryAttributeSchema', () => {
  it('maps all classification groups, including empty generic ones, and defaultValues -> options', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      code: 'Master - Educational toys',
      classifications: [
        {
          code: 'Educational toys*General', name: 'Характеристики',
          features: [
            {
              name: 'Тип', attributeCode: 'Educational toys*Type', mandatory: true, manufacturerSku: false,
              attributeType: { code: 'enum', multiValued: false },
              defaultValues: [{ code: 'сортер', name: 'сортер' }, { code: 'кубики', name: 'кубики' }],
            },
            {
              name: 'Размер, см', attributeCode: 'Educational toys*Size', mandatory: true, manufacturerSku: false,
              attributeType: { code: 'string', multiValued: false }, defaultValues: [],
            },
          ],
        },
        { code: '24*Harakteristiki', name: 'Глобальные характеристики', features: [] },
        { code: '54*Harakteristiki', name: 'Характеристики', features: [] },
      ],
    }))
    const result = await getCategoryAttributeSchema('c', '30067228', 'Master - Educational toys', fetchFn as any)
    expect(fetchFn.mock.calls[0][0]).toBe('https://mc.shop.kaspi.kz/content/pending/mc/category/Master%20-%20Educational%20toys/info?merchantCode=30067228')
    expect(result.classifications).toEqual([
      {
        code: 'Educational toys*General', name: 'Характеристики',
        features: [
          {
            name: 'Тип', attributeCode: 'Educational toys*Type', mandatory: true, manufacturerSku: false,
            type: 'enum', multiValued: false, options: [{ code: 'сортер', name: 'сортер' }, { code: 'кубики', name: 'кубики' }],
          },
          {
            name: 'Размер, см', attributeCode: 'Educational toys*Size', mandatory: true, manufacturerSku: false,
            type: 'string', multiValued: false, options: [],
          },
        ],
      },
      { code: '24*Harakteristiki', name: 'Глобальные характеристики', features: [] },
      { code: '54*Harakteristiki', name: 'Характеристики', features: [] },
    ])
  })
})

describe('uploadProductPhoto', () => {
  it('POSTs multipart with field name "file" and maps a successful upload', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      images: [{ id: '4109d2f5-3ad3-4fec-a5c0-560c16102f57', url: '/cnt/mct/i/4109d2f5-3ad3-4fec-a5c0-560c16102f57', partName: 'file', submittedFileName: 'photo.jpg', status: 'OK', format: 'JPEG', documentValidationResult: null }],
    }))
    const blob = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' })
    const result = await uploadProductPhoto('cookie=1', blob, 'photo.jpg', fetchFn as any)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/image/processor/merchant/upl/cnt/mct/i')
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.headers['content-type']).toBeUndefined()
    expect(result).toEqual({
      success: true,
      imageId: '4109d2f5-3ad3-4fec-a5c0-560c16102f57',
      urls: {
        large: 'https://mc.shop.kaspi.kz/image/processor/merchant/img/cnt/mct/i/4109d2f5-3ad3-4fec-a5c0-560c16102f57?format=gallery_large',
        medium: 'https://mc.shop.kaspi.kz/image/processor/merchant/img/cnt/mct/i/4109d2f5-3ad3-4fec-a5c0-560c16102f57?format=gallery_medium',
        small: 'https://mc.shop.kaspi.kz/image/processor/merchant/img/cnt/mct/i/4109d2f5-3ad3-4fec-a5c0-560c16102f57?format=thumbnail',
      },
    })
  })

  it('surfaces a non-OK Kaspi status as a failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ images: [{ id: 'x', status: 'REJECTED' }] }))
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const result = await uploadProductPhoto('c', blob, 'x.jpg', fetchFn as any)
    expect(result).toEqual({ success: false, sessionExpired: false, message: 'Kaspi отклонил фото: REJECTED' })
  })

  it('maps 401 to sessionExpired', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const result = await uploadProductPhoto('c', blob, 'x.jpg', fetchFn as any)
    expect(result).toEqual({ success: false, sessionExpired: true, message: 'HTTP 401' })
  })
})

describe('generateProductName', () => {
  it('sends the exact captured body and unquotes the plain-text response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('"Сортер пластик"', { status: 200 }))
    const name = await generateProductName(
      'cookie=1', '30067228',
      { code: 'china-toys', name: 'Без бренда' },
      'Master - Educational toys', '122252292',
      [{ attributeCode: 'Educational toys*Type', values: ['сортер'] }],
      fetchFn as any
    )
    expect(name).toBe('Сортер пластик')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/content/pending/mc/product/name/generate?merchantCode=30067228')
    expect(JSON.parse(init.body)).toEqual({
      brand: { code: 'china-toys', name: 'Без бренда', restricted: false, closed: false, personal: false, blocked: false },
      masterCategoryCode: 'Master - Educational toys',
      productCode: '122252292',
      features: [{ attributeCode: 'Educational toys*Type', values: ['сортер'] }],
    })
  })

  it('returns null (never throws) when Kaspi fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 500 }))
    const name = await generateProductName('c', '30067228', { code: 'x', name: 'x' }, 'X', '1', [], fetchFn as any)
    expect(name).toBeNull()
  })
})

const schema: ClassificationGroup[] = [
  {
    code: 'Educational toys*General', name: 'Характеристики',
    features: [
      { name: 'Тип', attributeCode: 'Educational toys*Type', mandatory: true, manufacturerSku: false, type: 'enum', multiValued: false, options: [{ code: 'сортер', name: 'сортер' }] },
      { name: 'Размер, см', attributeCode: 'Educational toys*Size', mandatory: true, manufacturerSku: false, type: 'string', multiValued: false, options: [] },
    ],
  },
  {
    code: 'Toys*Dopolnitelno', name: 'Дополнительно',
    features: [
      { name: 'Цвет', attributeCode: 'Toys*Color', mandatory: true, manufacturerSku: false, type: 'enum', multiValued: true, options: [{ code: 'желтый', name: 'желтый' }, { code: 'зеленый', name: 'зеленый' }] },
    ],
  },
  { code: '24*Harakteristiki', name: 'Глобальные характеристики', features: [] },
  { code: '54*Harakteristiki', name: 'Характеристики', features: [] },
]

const createParams = {
  sessionCookies: 'cookie=1',
  merchantId: '30067228',
  categoryCode: 'Master - Educational toys',
  categoryName: 'Развивающие игрушки',
  brand: { code: 'china-toys', name: 'Без бренда' },
  sku: '122252292',
  name: 'Сортер пластик',
  schema,
  selectedValues: {
    'Educational toys*Type': ['сортер'],
    'Educational toys*Size': ['20x15x8'],
    'Toys*Color': ['желтый', 'зеленый'],
  },
  imageId: '4109d2f5-3ad3-4fec-a5c0-560c16102f57',
  imageUrls: { large: 'L', medium: 'M', small: 'S' },
}

describe('createNewProductCard', () => {
  it('builds classifications from schema + selections and submits the exact captured create payload', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ code: '122252292', name: 'Сортер пластик', status: 'SUCCESS', errorReason: null }]))
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
    const result = await createNewProductCard({ ...createParams }, fetchFn as any)
    expect(result).toEqual({ success: true })

    const [createUrl, createInit] = fetchFn.mock.calls[0]
    expect(createUrl).toBe('https://mc.shop.kaspi.kz/content/pending/mc/product/create?isMobileApp=false')
    const body = JSON.parse(createInit.body)
    expect(body.code).toBe('122252292')
    expect(body.merchantCode).toBe('30067228')
    expect(body.name).toBe('Сортер пластик')
    expect(body.displayName).toBe('Сортер пластик')
    expect(body.brand).toEqual({ code: 'china-toys', name: 'Без бренда', restricted: false, closed: false, personal: false, blocked: false })
    expect(body.category).toEqual({ code: 'Master - Educational toys', name: 'Развивающие игрушки', restricted: false, closed: false, blocked: false, image: '', hasContentChild: false })
    expect(body.images).toEqual([{
      large: 'L', medium: 'M', small: 'S', width: 0, height: 0,
      location: '4109d2f5-3ad3-4fec-a5c0-560c16102f57', bucketName: 'temp-merchant-product-images',
      generatedByAI: false, visualType: '',
    }])
    expect(body.classifications).toEqual([
      {
        code: 'Educational toys*General', name: 'Характеристики',
        features: [
          { name: 'Тип', attributeCode: 'Educational toys*Type', mandatory: true, manufacturerSku: false, attributeType: { code: 'enum', multiValued: false }, values: [{ name: 'сортер', code: 'сортер' }] },
          { name: 'Размер, см', attributeCode: 'Educational toys*Size', mandatory: true, manufacturerSku: false, attributeType: { code: 'string', multiValued: false }, values: ['20x15x8'] },
        ],
      },
      {
        code: 'Toys*Dopolnitelno', name: 'Дополнительно',
        features: [
          { name: 'Цвет', attributeCode: 'Toys*Color', mandatory: true, manufacturerSku: false, attributeType: { code: 'enum', multiValued: true }, values: [{ name: 'желтый', code: 'желтый' }, { name: 'зеленый', code: 'зеленый' }] },
        ],
      },
      { code: '24*Harakteristiki', name: 'Глобальные характеристики', features: [] },
      { code: '54*Harakteristiki', name: 'Характеристики', features: [] },
    ])

    const [pUrl, pInit] = fetchFn.mock.calls[1]
    expect(pUrl).toBe('https://mc.shop.kaspi.kz/pricefeed/upload/merchant/process')
    expect(JSON.parse(pInit.body)).toEqual({
      merchantUid: '30067228', sku: '122252292', model: 'Сортер пластик', brand: 'china-toys',
    })
  })

  it('sends cityPrices/availabilities when price/stock are provided', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ code: '122252292', status: 'SUCCESS' }]))
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
    await createNewProductCard({
      ...createParams,
      cityPrices: [{ cityId: '511010000', value: 1500 }],
      availabilities: [{ storeCode: 'PP2', stockCount: 4 }],
    }, fetchFn as any)
    const pBody = JSON.parse(fetchFn.mock.calls[1][1].body)
    expect(pBody.cityPrices).toEqual([{ cityId: '511010000', value: 1500 }])
    expect(pBody.availabilities).toEqual([{ available: 'yes', storeId: '30067228_PP2', stockCount: 4 }])
  })

  it('fails when Kaspi rejects the card (status !== SUCCESS)', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse([{ code: '122252292', status: 'ERROR', errorReason: 'DUPLICATE' }]))
    const result = await createNewProductCard({ ...createParams }, fetchFn as any)
    expect(result).toEqual({ success: false, reason: 'other', message: 'Kaspi отклонил карточку: DUPLICATE' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('maps 401 on the create call to session_expired', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 }))
    const result = await createNewProductCard({ ...createParams }, fetchFn as any)
    expect(result).toEqual({ success: false, reason: 'session_expired', message: 'HTTP 401' })
  })

  it('fails when the pricefeed call is rejected after a successful create', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ code: '122252292', status: 'SUCCESS' }]))
      .mockResolvedValueOnce(new Response('nope', { status: 400 }))
    const result = await createNewProductCard({ ...createParams }, fetchFn as any)
    expect(result.success).toBe(false)
  })
})
