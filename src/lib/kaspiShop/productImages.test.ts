import { describe, it, expect } from 'vitest'
import { pickCatalogImage, imageSearchQueries } from './productImages'
import type { CatalogSearchProduct } from './addProduct'

const card = (id: string, title: string, imageUrl: string | null): CatalogSearchProduct =>
  ({ id, title, categoryName: null, imageUrl, shopLink: null })

// Four products on the live account share the name "Abil.Sisters F01kor" and
// differ only by master SKU, which is exactly why the match is on the id.
const results = [
  card('167403492', 'Abil.Sisters F01kor', 'https://cdn/a.jpg'),
  card('164246839', 'Abil.Sisters F01kor', 'https://cdn/b.jpg'),
  card('167403494', 'Abil.Sisters F01kor', null),
]

describe('pickCatalogImage', () => {
  it('takes the image of the card whose id is the master SKU', () => {
    expect(pickCatalogImage('164246839', results)).toBe('https://cdn/b.jpg')
  })

  it('never falls back to the first hit when the SKU is absent from results', () => {
    expect(pickCatalogImage('999999999', results)).toBeNull()
  })

  it('returns null when the matching card has no image', () => {
    expect(pickCatalogImage('167403494', results)).toBeNull()
  })

  it('returns null without a master SKU rather than guessing by name', () => {
    expect(pickCatalogImage(null, results)).toBeNull()
  })

  it('handles an empty result set', () => {
    expect(pickCatalogImage('164246839', [])).toBeNull()
  })
})

describe('imageSearchQueries', () => {
  it('tries the master SKU first, then the name', () => {
    expect(imageSearchQueries({ masterSku: '132062506', productName: 'Лонгслив Abil.Sisters бордовый' }))
      .toEqual(['132062506', 'Лонгслив Abil.Sisters бордовый'])
  })

  it('falls back to the name alone when there is no SKU', () => {
    expect(imageSearchQueries({ masterSku: null, productName: 'Юбка' })).toEqual(['Юбка'])
  })

  it('produces nothing to search when neither is usable', () => {
    expect(imageSearchQueries({ masterSku: null, productName: '   ' })).toEqual([])
  })
})
