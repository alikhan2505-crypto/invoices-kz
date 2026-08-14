import { describe, it, expect } from 'vitest'
import { checkNiche } from './niches'

function fakeFetch(status: number, body: any): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('checkNiche', () => {
  it('maps the real response shape into a NicheSummary', async () => {
    const fetchFn = fakeFetch(200, {
      data: {
        total: 6192,
        filters: [
          { id: 'price', rows: [
            { title: 'до 10 000 т', count: 3554 },
            { title: '10 000 - 49 999 т', count: 2555 },
          ] },
          { id: 'manufacturerName', rows: [
            { title: 'YETI', count: 12 },
            { title: 'RedFox', count: 40 },
            { title: 'A', count: 1 },
            { title: 'B', count: 2 },
            { title: 'C', count: 3 },
            { title: 'D', count: 4 },
          ] },
        ],
        cards: [
          { title: 'Термокружка 1', unitSalePrice: 1102, rating: 4.8, reviewsQuantity: 619, brand: 'Без бренда', previewImages: [{ medium: 'https://cdn/1.jpg' }] },
          { title: 'Термокружка 2', unitSalePrice: 1535, rating: 4.8, reviewsQuantity: 296, brand: 'RedFox', previewImages: [] },
        ],
      },
    })

    const result = await checkNiche('термокружка', fetchFn)

    expect(result.total).toBe(6192)
    expect(result.priceRanges).toEqual([
      { label: 'до 10 000 т', count: 3554 },
      { label: '10 000 - 49 999 т', count: 2555 },
    ])
    expect(result.topBrands).toEqual([
      { name: 'RedFox', count: 40 },
      { name: 'YETI', count: 12 },
      { name: 'D', count: 4 },
      { name: 'C', count: 3 },
      { name: 'B', count: 2 },
    ])
    expect(result.products).toEqual([
      { name: 'Термокружка 1', price: 1102, rating: 4.8, reviewsCount: 619, brand: 'Без бренда', imageUrl: 'https://cdn/1.jpg' },
      { name: 'Термокружка 2', price: 1535, rating: 4.8, reviewsCount: 296, brand: 'RedFox', imageUrl: null },
    ])
  })

  it('caps products at 12 even if more cards are returned', async () => {
    const cards = Array.from({ length: 15 }, (_, i) => ({
      title: `Товар ${i}`, unitSalePrice: 1000, rating: 5, reviewsQuantity: 1, brand: 'X', previewImages: [],
    }))
    const fetchFn = fakeFetch(200, { data: { total: 100, filters: [], cards } })
    const result = await checkNiche('x', fetchFn)
    expect(result.products).toHaveLength(12)
  })

  it('returns an empty summary on a failed request', async () => {
    const fetchFn = fakeFetch(500, {})
    const result = await checkNiche('x', fetchFn)
    expect(result).toEqual({ total: 0, priceRanges: [], topBrands: [], products: [] })
  })

  it('returns an empty summary when data is missing from the response', async () => {
    const fetchFn = fakeFetch(200, {})
    const result = await checkNiche('x', fetchFn)
    expect(result).toEqual({ total: 0, priceRanges: [], topBrands: [], products: [] })
  })
})
