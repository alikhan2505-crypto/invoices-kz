import { describe, it, expect } from 'vitest'
import { mergeTriggerWords, splitAtLastSeparator } from './triggerWords'

describe('mergeTriggerWords', () => {
  it('splits a comma-separated list', () => {
    expect(mergeTriggerWords([], 'price, how much, cost')).toEqual(['price', 'how much', 'cost'])
  })

  it('accepts semicolons and newlines as separators too', () => {
    expect(mergeTriggerWords([], 'цена; стоимость\nтариф')).toEqual(['цена', 'стоимость', 'тариф'])
  })

  // The bug this whole module exists for: a trailing comma used to be stored as
  // part of the word, and "price," never matched a comment containing "price".
  it('never keeps a separator inside a stored word', () => {
    const words = mergeTriggerWords([], 'price,')
    expect(words).toEqual(['price'])
    expect(words[0]).not.toContain(',')
  })

  it('trims surrounding whitespace', () => {
    expect(mergeTriggerWords([], '  price ,   how much  ')).toEqual(['price', 'how much'])
  })

  it('drops empty fragments from doubled or trailing separators', () => {
    expect(mergeTriggerWords([], 'price,,how much,')).toEqual(['price', 'how much'])
    expect(mergeTriggerWords([], ' , ; ')).toEqual([])
  })

  it('appends to existing words instead of replacing them', () => {
    expect(mergeTriggerWords(['цена'], 'price, cost')).toEqual(['цена', 'price', 'cost'])
  })

  it('dedupes case-insensitively against existing words', () => {
    expect(mergeTriggerWords(['Price'], 'price')).toEqual(['Price'])
  })

  it('dedupes within the incoming batch', () => {
    expect(mergeTriggerWords([], 'цена, Цена, ЦЕНА')).toEqual(['цена'])
  })

  it('returns the same array reference when nothing was added', () => {
    const existing = ['price']
    expect(mergeTriggerWords(existing, 'price')).toBe(existing)
    expect(mergeTriggerWords(existing, '   ')).toBe(existing)
  })
})

describe('splitAtLastSeparator', () => {
  it('keeps what is still being typed out of the committed part', () => {
    expect(splitAtLastSeparator('price, how m')).toEqual({ committed: 'price', remainder: 'how m' })
  })

  it('commits everything when the input ends with a separator', () => {
    expect(splitAtLastSeparator('price, how much,')).toEqual({ committed: 'price, how much', remainder: '' })
  })

  it('commits nothing when there is no separator yet', () => {
    expect(splitAtLastSeparator('price')).toEqual({ committed: '', remainder: 'price' })
  })

  it('drops the space a person types after the comma', () => {
    expect(splitAtLastSeparator('price,   ')).toEqual({ committed: 'price', remainder: '' })
  })
})
