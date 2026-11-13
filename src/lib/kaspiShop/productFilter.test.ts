import { describe, it, expect } from 'vitest'
import { filterProducts, filterCounts, matchesQuery, PRODUCTS_PAGE_SIZE } from './productFilter'

const p = (over: Record<string, unknown>) => ({ product_name: 'Влажные салфетки Elma 72 шт', brand: 'Elma', kaspi_sku: '100200', kaspi_master_sku: '555111', enabled: true, available_for_sale: true, held_at_floor: false, ...over }) as any

describe('matchesQuery', () => {
  it('пустой запрос подходит всем', () => {
    expect(matchesQuery(p({}), '')).toBe(true)
    expect(matchesQuery(p({}), '   ')).toBe(true)
  })
  it('регистр и «ё» не важны; слова в любом порядке', () => {
    expect(matchesQuery(p({ product_name: 'Ёлка искусственная' }), 'елка')).toBe(true)
    expect(matchesQuery(p({}), 'САЛФЕТКИ')).toBe(true)
    expect(matchesQuery(p({}), '72 elma')).toBe(true)
    expect(matchesQuery(p({}), 'elma 99')).toBe(false)
  })
  it('ищет по бренду и обоим артикулам', () => {
    expect(matchesQuery(p({ product_name: 'Товар', brand: 'Acme' }), 'acme')).toBe(true)
    expect(matchesQuery(p({}), '100200')).toBe(true)
    expect(matchesQuery(p({}), '555111')).toBe(true)
  })
  it('пустые поля не ломают поиск', () => {
    expect(matchesQuery(p({ brand: null, kaspi_sku: undefined, kaspi_master_sku: null }), 'салфетки')).toBe(true)
  })
})

describe('filterProducts', () => {
  const list = [
    p({ product_name: 'A включён' }),
    p({ product_name: 'B на паузе', enabled: false }),
    p({ product_name: 'C у минимума', held_at_floor: true }),
    p({ product_name: 'D снят с продажи', available_for_sale: false }),
    p({ product_name: 'E старая строка', available_for_sale: null }),
    p({ product_name: 'F снят и включён', available_for_sale: false, enabled: true, held_at_floor: true }),
  ]
  const names = (r: any[]) => r.map(x => x.product_name[0])

  it('all: всё', () => expect(names(filterProducts(list, '', 'all'))).toEqual(['A', 'B', 'C', 'D', 'E', 'F']))
  it('active: включённые и в продаже (null = в продаже)', () => expect(names(filterProducts(list, '', 'active'))).toEqual(['A', 'C', 'E']))
  it('paused: выключенные', () => expect(names(filterProducts(list, '', 'paused'))).toEqual(['B']))
  it('floor: упёрлись в минимум, снятый с продажи не считается', () => expect(names(filterProducts(list, '', 'floor'))).toEqual(['C']))
  it('offsale: снятые с продажи', () => expect(names(filterProducts(list, '', 'offsale'))).toEqual(['D', 'F']))
  it('запрос и фильтр работают вместе', () => expect(names(filterProducts(list, 'минимума', 'floor'))).toEqual(['C']))

  it('счётчики совпадают с тем, что вернёт фильтр', () => {
    const counts = filterCounts(list)
    expect(counts).toEqual({ all: 6, active: 3, paused: 1, floor: 1, offsale: 2 })
    for (const k of ['all', 'active', 'paused', 'floor', 'offsale'] as const) expect(filterProducts(list, '', k)).toHaveLength(counts[k])
  })
})

it('размер страницы положительный', () => {
  expect(PRODUCTS_PAGE_SIZE).toBeGreaterThan(0)
})
