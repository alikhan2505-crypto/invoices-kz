import { describe, it, expect } from 'vitest'
import { findStopPhraseMatch, matchesStopPhrase } from './stopPhrases'

const DEFAULTS = ['оператор', 'человек', 'менеджер', 'позовите', 'поговорить с человеком']

describe('findStopPhraseMatch: stem + short ending, Cyrillic-aware', () => {
  it('fires on ordinary inflected requests for a human (RU + KZ)', () => {
    expect(findStopPhraseMatch('соедините с оператором', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('хочу поговорить с менеджером', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('можно менеджера?', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('дайте живого человека', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('с человеком можно поговорить?', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('менеджерге қосыңыз', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('операторға жазайын', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('позовите оператора пожалуйста', DEFAULTS)).toBe(true)
  })

  it('each default fires on its own for those requests', () => {
    expect(matchesStopPhrase('соедините с оператором', 'оператор')).toBe(true)
    expect(matchesStopPhrase('операторға жазайын', 'оператор')).toBe(true)
    expect(matchesStopPhrase('можно менеджера?', 'менеджер')).toBe(true)
    expect(matchesStopPhrase('менеджерге қосыңыз', 'менеджер')).toBe(true)
    expect(matchesStopPhrase('хочу поговорить с менеджером', 'менеджер')).toBe(true)
    expect(matchesStopPhrase('дайте живого человека', 'человек')).toBe(true)
    expect(matchesStopPhrase('с человеком можно поговорить?', 'человек')).toBe(true)
    expect(matchesStopPhrase('хочу поговорить с человеком', 'поговорить с человеком')).toBe(true)
  })

  it('does not fire «человек» when people are being counted', () => {
    expect(findStopPhraseMatch('нас будет 4 человека', DEFAULTS)).toBe(false)
    expect(findStopPhraseMatch('Количество человек: 3', DEFAULTS)).toBe(false)
    expect(findStopPhraseMatch('столик на двоих человек', DEFAULTS)).toBe(false)
    expect(findStopPhraseMatch('будет 4-х человек', DEFAULTS)).toBe(false)
    expect(findStopPhraseMatch('на 10 человек, на субботу', DEFAULTS)).toBe(false)
    expect(findStopPhraseMatch('нас пятеро человек', DEFAULTS)).toBe(false)
    expect(findStopPhraseMatch('сколько человек помещается?', DEFAULTS)).toBe(false)
    expect(findStopPhraseMatch('кол-во человек 5', DEFAULTS)).toBe(false)
    expect(findStopPhraseMatch('екі человек боламыз', DEFAULTS)).toBe(false)
  })

  it('still fires when a counted «человек» is followed by a real request', () => {
    expect(findStopPhraseMatch('нас 4 человека, позовите кого-нибудь', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('нас 4 человека, дайте живого человека', ['человек'])).toBe(true)
  })

  it('does not fire when the stem is only part of another word', () => {
    expect(findStopPhraseMatch('курсы по менеджменту', ['менеджер'])).toBe(false)
    expect(findStopPhraseMatch('сверхчеловек', ['человек'])).toBe(false)
    expect(findStopPhraseMatch('человечество', ['человек'])).toBe(false)
    expect(findStopPhraseMatch('Количество человек: 3', ['человека'])).toBe(false)
  })

  it('caps the ending at a few letters', () => {
    // «оператор» + 6 букв -- уже не окончание
    expect(matchesStopPhrase('операторлармен', 'оператор')).toBe(false)
    expect(matchesStopPhrase('операторами', 'оператор')).toBe(true)
  })

  it('fires on the phrase as a whole word, any case, next to punctuation', () => {
    expect(findStopPhraseMatch('Оператор!', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('дайте МЕНЕДЖЕР, срочно', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('нужен живой человек.', DEFAULTS)).toBe(true)
    expect(findStopPhraseMatch('(человек)', ['человек'])).toBe(true)
    expect(findStopPhraseMatch('человек', ['человек'])).toBe(true)
  })

  it('matches multi-word phrases as a whole sequence, with any whitespace between words', () => {
    expect(findStopPhraseMatch('хочу поговорить с человеком срочно', ['поговорить с человеком'])).toBe(true)
    expect(findStopPhraseMatch('хочу поговорить   с\nчеловеком', ['поговорить с человеком'])).toBe(true)
    expect(findStopPhraseMatch('хочу поговорить с человеком', ['  поговорить   с человеком  '])).toBe(true)
    expect(findStopPhraseMatch('поговорить со человеком', ['поговорить с человеком'])).toBe(true)
    expect(findStopPhraseMatch('поговорить с человечком', ['поговорить с человеком'])).toBe(false)
    expect(findStopPhraseMatch('поговорить о человеком', ['поговорить с человеком'])).toBe(false)
  })

  it('treats ё and е as the same letter', () => {
    expect(matchesStopPhrase('Жалоба на счёт', 'счет')).toBe(true)
    expect(matchesStopPhrase('Жалоба на счет', 'счёт')).toBe(true)
  })

  it('works for Kazakh and Latin phrases too', () => {
    expect(findStopPhraseMatch('Менеджерге қосыңыз', ['қосыңыз'])).toBe(true)
    expect(findStopPhraseMatch('call a human please', ['human'])).toBe(true)
    expect(findStopPhraseMatch('talk to humans', ['human'])).toBe(true)
    expect(findStopPhraseMatch('humanitarian aid', ['human'])).toBe(false)
  })

  it('escapes regex metacharacters in owner-typed phrases', () => {
    expect(findStopPhraseMatch('нужна помощь (срочно)', ['помощь (срочно)'])).toBe(true)
    expect(findStopPhraseMatch('a+b', ['a+b'])).toBe(true)
    expect(findStopPhraseMatch('aab', ['a+b'])).toBe(false)
  })

  it('ignores empty, blank and non-string entries', () => {
    expect(findStopPhraseMatch('позовите оператора', [])).toBe(false)
    expect(findStopPhraseMatch('любой текст', ['', '   '])).toBe(false)
    expect(findStopPhraseMatch('оператор', [null as unknown as string, 'оператор'])).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(findStopPhraseMatch('привет, сколько стоит?', DEFAULTS)).toBe(false)
  })
})
