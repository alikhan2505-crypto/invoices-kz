import { describe, it, expect } from 'vitest'
import { findMatchingTemplate } from './instagramReplyMatch'

const templates = [
  { id: 't1', trigger_words: ['цена', 'сколько стоит'], reply_text: 'Актуальные цены — в шапке профиля.' },
  { id: 't2', trigger_words: ['доставка'], reply_text: 'Доставка по всему Казахстану, 1-3 дня.' },
]

describe('findMatchingTemplate', () => {
  it('matches a single trigger word case-insensitively', () => {
    const result = findMatchingTemplate('Какая у вас цена?', templates)
    expect(result?.id).toBe('t1')
  })

  it('matches a multi-word trigger phrase', () => {
    const result = findMatchingTemplate('Здравствуйте, сколько стоит доставка?', templates)
    // Both templates' triggers appear; the first template in list order wins.
    expect(result?.id).toBe('t1')
  })

  it('matches regardless of surrounding punctuation', () => {
    const result = findMatchingTemplate('Доставка?!', templates)
    expect(result?.id).toBe('t2')
  })

  it('returns null when nothing matches', () => {
    const result = findMatchingTemplate('Красивый пост!', templates)
    expect(result).toBeNull()
  })

  it('returns null for an empty template list', () => {
    const result = findMatchingTemplate('сколько стоит', [])
    expect(result).toBeNull()
  })

  it('is case-insensitive on trigger words themselves', () => {
    const upperTemplates = [{ id: 't3', trigger_words: ['ЦЕНА'], reply_text: 'x' }]
    const result = findMatchingTemplate('какая цена?', upperTemplates)
    expect(result?.id).toBe('t3')
  })
})
