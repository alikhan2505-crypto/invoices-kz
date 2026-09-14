import { describe, it, expect } from 'vitest'
import { buildWholesaleModels, resolveWholesaleLine } from './wholesaleStorefront'

describe('buildWholesaleModels', () => {
  it('nests each model\'s variants under it, ignoring variants for other models', () => {
    const models = [
      { id: 'm1', name: 'Лонгслив Long01', price: '4200', image_url: '/img1.jpg', storefront_category_id: 'cat1' },
      { id: 'm2', name: 'Шапка Yong', price: '2500', image_url: null, storefront_category_id: null },
    ]
    const variants = [
      { id: 'v1', model_id: 'm1', size: 'M', color: 'тёмно-синий', stock_count: 5 },
      { id: 'v2', model_id: 'm1', size: 'L', color: 'тёмно-синий', stock_count: 0 },
      { id: 'v3', model_id: 'm2', size: '56-60', color: 'серый', stock_count: null },
    ]
    const result = buildWholesaleModels(models, variants)
    expect(result).toEqual([
      {
        id: 'm1', name: 'Лонгслив Long01', price: 4200, imageUrl: '/img1.jpg', categoryId: 'cat1',
        variants: [
          { id: 'v1', size: 'M', color: 'тёмно-синий', stockCount: 5 },
          { id: 'v2', size: 'L', color: 'тёмно-синий', stockCount: 0 },
        ],
      },
      {
        id: 'm2', name: 'Шапка Yong', price: 2500, imageUrl: null, categoryId: null,
        variants: [{ id: 'v3', size: '56-60', color: 'серый', stockCount: null }],
      },
    ])
  })

  it('returns a model with an empty variants array when it has none', () => {
    const result = buildWholesaleModels(
      [{ id: 'm1', name: 'Без вариантов', price: '1000', image_url: null, storefront_category_id: null }],
      []
    )
    expect(result).toEqual([{ id: 'm1', name: 'Без вариантов', price: 1000, imageUrl: null, categoryId: null, variants: [] }])
  })
})

describe('resolveWholesaleLine', () => {
  const model = { id: 'm1', name: 'Лонгслив Long01', price: 4200 }
  const variant = { size: 'M', color: 'тёмно-синий' }

  it('resolves a valid model+variant+qty into a priced line with size/color baked into the name', () => {
    const result = resolveWholesaleLine(model, variant, 2)
    expect(result).toEqual({ name: 'Лонгслив Long01, тёмно-синий, M', price: 4200, qty: 2 })
  })

  it('resolves the same way regardless of variant stock -- zero/null stock is "order tailoring", not a block', () => {
    // resolveWholesaleLine takes only size/color, never stockCount, so a
    // zero-stock variant resolves identically -- the caller decided it was
    // orderable (a real variant row exists) before calling this.
    const result = resolveWholesaleLine(model, variant, 1)
    expect(result?.price).toBe(4200)
  })

  it('returns null when the model is missing', () => {
    expect(resolveWholesaleLine(null, variant, 1)).toBeNull()
  })

  it('returns null when the variant is missing (buyer sent a size/color combo the seller never defined)', () => {
    expect(resolveWholesaleLine(model, null, 1)).toBeNull()
  })

  it('returns null for a non-positive quantity', () => {
    expect(resolveWholesaleLine(model, variant, 0)).toBeNull()
    expect(resolveWholesaleLine(model, variant, -1)).toBeNull()
  })

  it('returns null when the model price is not positive (defensive -- a real row is always priced)', () => {
    expect(resolveWholesaleLine({ ...model, price: 0 }, variant, 1)).toBeNull()
  })
})
