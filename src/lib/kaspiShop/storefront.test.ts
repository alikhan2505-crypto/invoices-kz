import { describe, it, expect } from 'vitest'
import { filterStorefrontProducts, filterCustomStorefrontProducts } from './storefront'

describe('filterStorefrontProducts', () => {
  it('excludes a Kaspi product the seller has not opted in (show_on_storefront: false)', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: true, image_url: null, show_on_storefront: false, storefront_category_id: null },
    ])
    expect(result).toEqual([])
  })

  it('excludes products removed from sale (available_for_sale: false), even if opted in', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: false, image_url: null, show_on_storefront: true, storefront_category_id: null },
    ])
    expect(result).toEqual([])
  })

  it('includes an opted-in product with the repricer never turned on, as long as they are for sale', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: true, image_url: null, show_on_storefront: true, storefront_category_id: null },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000, imageUrl: null, categoryId: null }])
  })

  it('treats a null available_for_sale (pre-migration row) as available', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: null, image_url: null, show_on_storefront: true, storefront_category_id: null },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000, imageUrl: null, categoryId: null }])
  })

  it('excludes products with zero stock', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 0, available_for_sale: true, image_url: null, show_on_storefront: true, storefront_category_id: null },
    ])
    expect(result).toEqual([])
  })

  it('includes products with null stock (untracked stock)', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: null, available_for_sale: true, image_url: null, show_on_storefront: true, storefront_category_id: null },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000, imageUrl: null, categoryId: null }])
  })

  it('excludes products with zero or negative price', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 0, stock_count: 5, available_for_sale: true, image_url: null, show_on_storefront: true, storefront_category_id: null },
      { id: '2', product_name: 'Товар Б', brand: 'Brand', own_current_price: -100, stock_count: 5, available_for_sale: true, image_url: null, show_on_storefront: true, storefront_category_id: null },
    ])
    expect(result).toEqual([])
  })

  it('trims name/brand and coerces price to a number', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: '  Товар А  ', brand: ' Brand ', own_current_price: '2500', stock_count: 3, available_for_sale: true, image_url: null, show_on_storefront: true, storefront_category_id: null },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 2500, imageUrl: null, categoryId: null }])
  })

  it('passes through a real image_url, and reports null for a product never sold yet', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: true, image_url: 'https://resources.cdn-kaspi.kz/img/a.jpg', show_on_storefront: true, storefront_category_id: null },
      { id: '2', product_name: 'Товар Б', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: true, image_url: null, show_on_storefront: true, storefront_category_id: null },
    ])
    expect(result).toEqual([
      { id: '1', name: 'Товар А', brand: 'Brand', price: 1000, imageUrl: 'https://resources.cdn-kaspi.kz/img/a.jpg', categoryId: null },
      { id: '2', name: 'Товар Б', brand: 'Brand', price: 1000, imageUrl: null, categoryId: null },
    ])
  })

  it('passes through a real storefront_category_id as categoryId', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, available_for_sale: true, image_url: null, show_on_storefront: true, storefront_category_id: 'cat-1' },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000, imageUrl: null, categoryId: 'cat-1' }])
  })
})

describe('filterCustomStorefrontProducts', () => {
  it('includes a manually-added product with no stock tracking (null = untracked)', () => {
    const result = filterCustomStorefrontProducts([
      { id: '1', name: 'Ручной товар', price: 3000, image_url: null, stock_count: null, storefront_category_id: null },
    ])
    expect(result).toEqual([{ id: '1', name: 'Ручной товар', brand: '', price: 3000, imageUrl: null, categoryId: null }])
  })

  it('excludes a manually-added product with zero stock', () => {
    const result = filterCustomStorefrontProducts([
      { id: '1', name: 'Ручной товар', price: 3000, image_url: null, stock_count: 0, storefront_category_id: null },
    ])
    expect(result).toEqual([])
  })

  it('excludes a manually-added product with zero or negative price', () => {
    const result = filterCustomStorefrontProducts([
      { id: '1', name: 'Ручной товар', price: 0, image_url: null, stock_count: null, storefront_category_id: null },
    ])
    expect(result).toEqual([])
  })

  it('passes through the image_url and coerces price to a number', () => {
    const result = filterCustomStorefrontProducts([
      { id: '1', name: '  Ручной товар  ', price: '4500', image_url: 'https://example.com/a.jpg', stock_count: 2, storefront_category_id: null } as any,
    ])
    expect(result).toEqual([{ id: '1', name: 'Ручной товар', brand: '', price: 4500, imageUrl: 'https://example.com/a.jpg', categoryId: null }])
  })

  it('passes through a real storefront_category_id as categoryId', () => {
    const result = filterCustomStorefrontProducts([
      { id: '1', name: 'Ручной товар', price: 3000, image_url: null, stock_count: null, storefront_category_id: 'cat-2' },
    ])
    expect(result).toEqual([{ id: '1', name: 'Ручной товар', brand: '', price: 3000, imageUrl: null, categoryId: 'cat-2' }])
  })
})
