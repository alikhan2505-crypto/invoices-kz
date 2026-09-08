import { describe, it, expect } from 'vitest'
import { pickProductPhoto, CatalogProduct } from './productPhoto'

// Names and a reply taken from the live Abil.Sisters / Manufactor Astana
// catalogue and transcripts, so the thresholds are tuned against what the
// agent actually writes rather than invented examples.
const SKIRT = 'Юбка Abil.Sisters коричневая размер 2XL'
const WIPES_ELMA = 'Влажные салфетки Elma Elma 72 шт'
const WIPES_FRESH = 'Влажные салфетки Natural Fresh Baby 70ш'

const catalog: CatalogProduct[] = [
  { name: SKIRT, price: 4800, imageUrl: 'https://cdn/skirt.jpg' },
  { name: WIPES_ELMA, price: 613, imageUrl: 'https://cdn/elma.jpg' },
  { name: WIPES_FRESH, price: 1150, imageUrl: null },
]

describe('pickProductPhoto', () => {
  it('attaches the photo of the product the reply names', () => {
    const reply = 'Отлично! Юбка Abil.Sisters коричневая размер 2XL за 4 800 ₸ — прекрасный выбор!'
    expect(pickProductPhoto(reply, catalog)).toBe('https://cdn/skirt.jpg')
  })

  // The founder's rule, stated plainly: no photo means show nothing.
  it('sends nothing when the named product has no photo', () => {
    const reply = 'Влажные салфетки Natural Fresh Baby 70ш стоят 1 150 ₸.'
    expect(pickProductPhoto(reply, catalog)).toBeNull()
  })

  it('sends nothing when no product is named at all', () => {
    expect(pickProductPhoto('Здравствуйте! Чем могу помочь?', catalog)).toBeNull()
  })

  // Sharing the words "влажные салфетки" is not naming a product.
  it('does not match on a word two products merely share', () => {
    expect(pickProductPhoto('У нас есть влажные салфетки разных марок.', catalog)).toBeNull()
  })

  it('sends nothing when two products match equally well', () => {
    const twins: CatalogProduct[] = [
      { name: 'Юбка Abil.Sisters коричневая', price: 4800, imageUrl: 'https://cdn/brown.jpg' },
      { name: 'Юбка Abil.Sisters коричневая', price: 5200, imageUrl: 'https://cdn/brown-xl.jpg' },
    ]
    expect(pickProductPhoto('Юбка Abil.Sisters коричневая — 4 800 ₸', twins)).toBeNull()
  })

  it('tolerates punctuation and case differences', () => {
    const reply = 'юбка abil sisters, КОРИЧНЕВАЯ (размер 2xl) — 4800'
    expect(pickProductPhoto(reply, catalog)).toBe('https://cdn/skirt.jpg')
  })

  it('picks the better match when one product is a fuller mention than another', () => {
    const reply = 'Влажные салфетки Elma Elma 72 шт — 613 ₸, есть в наличии.'
    expect(pickProductPhoto(reply, catalog)).toBe('https://cdn/elma.jpg')
  })

  it('returns null for an empty catalogue or an empty reply', () => {
    expect(pickProductPhoto('Юбка Abil.Sisters коричневая размер 2XL', [])).toBeNull()
    expect(pickProductPhoto('   ', catalog)).toBeNull()
  })

  it('ignores products that have a photo but no name', () => {
    expect(pickProductPhoto('что-то', [{ name: '', price: 1, imageUrl: 'https://cdn/x.jpg' }])).toBeNull()
  })

  it('does not attach a photo for a partial mention below the threshold', () => {
    // Names the brand only -- two of six significant words.
    expect(pickProductPhoto('Мы шьём одежду Abil Sisters.', catalog)).toBeNull()
  })
})
