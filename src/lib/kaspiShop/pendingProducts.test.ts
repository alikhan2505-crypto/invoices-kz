import { describe, it, expect } from 'vitest'
import { listPendingProducts, getPendingCount } from './pendingProducts'

function fakeFetch(status: number, body: any): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('listPendingProducts', () => {
  it('maps the real response shape into PendingProduct, with hasMore true on a full page', async () => {
    const fetchFn = fakeFetch(201, {
      data: [
        { code: 'A1', name: 'Товар 1', brand: 'Abil.Sisters', category: { name: 'Одежда', leaf: false }, images: [{ medium: 'https://cdn/1.jpg' }] },
        { code: 'A2', name: 'Товар 2', brand: null, category: null, images: [] },
        { code: 'A3', name: 'Товар 3', brand: 'X', category: { name: 'Y' }, images: [{ medium: 'https://cdn/3.jpg' }] },
        { code: 'A4', name: 'Товар 4', brand: 'X', category: { name: 'Y' }, images: [{ medium: 'https://cdn/4.jpg' }] },
        { code: 'A5', name: 'Товар 5', brand: 'X', category: { name: 'Y' }, images: [{ medium: 'https://cdn/5.jpg' }] },
      ],
    })
    const result = await listPendingProducts('cookies', 'merchant1', 1, fetchFn)
    expect(result.products).toHaveLength(5)
    expect(result.products[0]).toEqual({ code: 'A1', name: 'Товар 1', brand: 'Abil.Sisters', categoryName: 'Одежда', imageUrl: 'https://cdn/1.jpg' })
    expect(result.products[1]).toEqual({ code: 'A2', name: 'Товар 2', brand: null, categoryName: null, imageUrl: null })
    expect(result.hasMore).toBe(true)
    expect(result.sessionExpired).toBe(false)
  })

  it('sets hasMore false on a short page', async () => {
    const fetchFn = fakeFetch(201, { data: [{ code: 'A1', name: 'Товар 1', brand: 'X', category: { name: 'Y' }, images: [] }] })
    const result = await listPendingProducts('cookies', 'merchant1', 1, fetchFn)
    expect(result.hasMore).toBe(false)
  })

  it('returns an empty result and sessionExpired:true on a 401', async () => {
    const fetchFn = fakeFetch(401, {})
    const result = await listPendingProducts('cookies', 'merchant1', 1, fetchFn)
    expect(result).toEqual({ products: [], hasMore: false, sessionExpired: true })
  })

  it('returns an empty result and sessionExpired:false on a non-401 failure', async () => {
    const fetchFn = fakeFetch(500, {})
    const result = await listPendingProducts('cookies', 'merchant1', 1, fetchFn)
    expect(result).toEqual({ products: [], hasMore: false, sessionExpired: false })
  })
})

describe('getPendingCount', () => {
  it('returns just the CHECK count', async () => {
    const fetchFn = fakeFetch(200, { IMPORTED: 0, CHECK: 3, PENDING: 0, TRASH: 0 })
    const result = await getPendingCount('cookies', 'merchant1', fetchFn)
    expect(result).toEqual({ count: 3, sessionExpired: false })
  })

  it('returns 0 and sessionExpired:true on a 401', async () => {
    const fetchFn = fakeFetch(401, {})
    const result = await getPendingCount('cookies', 'merchant1', fetchFn)
    expect(result).toEqual({ count: 0, sessionExpired: true })
  })
})
