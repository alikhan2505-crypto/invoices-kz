import { describe, it, expect } from 'vitest'
import { filterStorefrontProducts } from './storefront'

describe('filterStorefrontProducts', () => {
  it('excludes disabled products', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, enabled: false },
    ])
    expect(result).toEqual([])
  })

  it('excludes products with zero stock', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 0, enabled: true },
    ])
    expect(result).toEqual([])
  })

  it('includes products with null stock (untracked stock)', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: null, enabled: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000 }])
  })

  it('excludes products with zero or negative price', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 0, stock_count: 5, enabled: true },
      { id: '2', product_name: 'Товар Б', brand: 'Brand', own_current_price: -100, stock_count: 5, enabled: true },
    ])
    expect(result).toEqual([])
  })

  it('trims name/brand and coerces price to a number', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: '  Товар А  ', brand: ' Brand ', own_current_price: '2500', stock_count: 3, enabled: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 2500 }])
  })

  it('includes positive-stock enabled products', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 10, enabled: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000 }])
  })
})
