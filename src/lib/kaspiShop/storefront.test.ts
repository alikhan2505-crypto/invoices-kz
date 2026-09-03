import { describe, it, expect } from 'vitest'
import { filterStorefrontProducts } from './storefront'

describe('filterStorefrontProducts', () => {
  it('excludes products removed from sale (available_for_sale: false)', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: false },
    ])
    expect(result).toEqual([])
  })

  it('includes products with the repricer never turned on, as long as they are for sale', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000 }])
  })

  it('treats a null available_for_sale (pre-migration row) as available', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: null },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000 }])
  })

  it('excludes products with zero stock', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 0, available_for_sale: true },
    ])
    expect(result).toEqual([])
  })

  it('includes products with null stock (untracked stock)', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: null, available_for_sale: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000 }])
  })

  it('excludes products with zero or negative price', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 0, stock_count: 5, available_for_sale: true },
      { id: '2', product_name: 'Товар Б', brand: 'Brand', own_current_price: -100, stock_count: 5, available_for_sale: true },
    ])
    expect(result).toEqual([])
  })

  it('trims name/brand and coerces price to a number', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: '  Товар А  ', brand: ' Brand ', own_current_price: '2500', stock_count: 3, available_for_sale: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 2500 }])
  })

  it('includes positive-stock products for sale', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 10, available_for_sale: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000 }])
  })
})
