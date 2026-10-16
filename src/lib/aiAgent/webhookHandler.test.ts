import { describe, it, expect } from 'vitest'
import { findStopPhraseMatch } from './webhookHandler'

describe('findStopPhraseMatch', () => {
  it('matches case-insensitively as a whole word', () => {
    expect(findStopPhraseMatch('позовите ОПЕРАТОР пожалуйста', ['оператор', 'человек'])).toBe(true)
  })
  it('does not fire «человек» when people are being counted', () => {
    expect(findStopPhraseMatch('нас будет 4 человека', ['оператор', 'человек'])).toBe(false)
    expect(findStopPhraseMatch('Количество человек: 3', ['оператор', 'человек'])).toBe(false)
    expect(findStopPhraseMatch('на двоих человек', ['оператор', 'человек'])).toBe(false)
  })
  it('matches inflected requests for a human against the defaults (16.10.2026)', () => {
    const defaults = ['оператор', 'человек', 'менеджер', 'позовите', 'поговорить с человеком']
    for (const text of [
      'соедините с оператором',
      'хочу поговорить с менеджером',
      'можно менеджера?',
      'дайте живого человека',
      'с человеком можно поговорить?',
      'менеджерге қосыңыз',
      'операторға жазайын',
    ]) {
      expect(findStopPhraseMatch(text, defaults), text).toBe(true)
    }
  })
  it('returns false when nothing matches', () => {
    expect(findStopPhraseMatch('привет, сколько стоит?', ['оператор', 'человек'])).toBe(false)
  })
  it('returns false for an empty phrase list', () => {
    expect(findStopPhraseMatch('позовите оператора', [])).toBe(false)
  })
  it('matches a multi-word phrase as a whole sequence', () => {
    expect(findStopPhraseMatch('хочу поговорить с человеком срочно', ['поговорить с человеком'])).toBe(true)
  })
})
