import { describe, it, expect } from 'vitest'
import { findStopPhraseMatch } from './webhookHandler'

describe('findStopPhraseMatch', () => {
  it('matches case-insensitively against a substring', () => {
    expect(findStopPhraseMatch('позовите ОПЕРАТОРА пожалуйста', ['оператор', 'человек'])).toBe(true)
  })
  it('returns false when nothing matches', () => {
    expect(findStopPhraseMatch('привет, сколько стоит?', ['оператор', 'человек'])).toBe(false)
  })
  it('returns false for an empty phrase list', () => {
    expect(findStopPhraseMatch('позовите оператора', [])).toBe(false)
  })
  it('matches a multi-word phrase as a substring', () => {
    expect(findStopPhraseMatch('хочу поговорить с человеком срочно', ['поговорить с человеком'])).toBe(true)
  })
})
