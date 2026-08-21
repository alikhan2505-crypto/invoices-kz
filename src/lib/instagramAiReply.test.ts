import { describe, it, expect } from 'vitest'
import { parseExtractedFieldsBlock } from './instagramAiReply'

describe('parseExtractedFieldsBlock', () => {
  it('parses a valid JSON block and strips it from the visible text', () => {
    const raw = 'Спасибо, записал ваш номер!\n<<<EXTRACTED>>>{"phone":"+77771234567"}<<<END>>>'
    const { cleanText, extractedFields } = parseExtractedFieldsBlock(raw)
    expect(cleanText).toBe('Спасибо, записал ваш номер!')
    expect(extractedFields).toEqual({ phone: '+77771234567' })
  })

  it('parses multiple fields, including a custom (non-preset) field used as its own key', () => {
    const raw = 'Хорошо!\n<<<EXTRACTED>>>{"name":"Иван","Любимый цвет":"синий"}<<<END>>>'
    const { extractedFields } = parseExtractedFieldsBlock(raw)
    expect(extractedFields).toEqual({ name: 'Иван', 'Любимый цвет': 'синий' })
  })

  it('returns no extractedFields and the original text when no delimiter block is present', () => {
    const raw = 'Просто обычный ответ без блока.'
    const result = parseExtractedFieldsBlock(raw)
    expect(result.cleanText).toBe(raw)
    expect(result.extractedFields).toBeUndefined()
  })

  it('treats an empty JSON object as no extraction, but still strips the block', () => {
    const raw = 'Понял вас.\n<<<EXTRACTED>>>{}<<<END>>>'
    const { cleanText, extractedFields } = parseExtractedFieldsBlock(raw)
    expect(cleanText).toBe('Понял вас.')
    expect(extractedFields).toBeUndefined()
  })

  it('degrades to no extraction (not a throw) on malformed JSON, and still strips the block', () => {
    const raw = 'Ок.\n<<<EXTRACTED>>>{not valid json<<<END>>>'
    const { cleanText, extractedFields } = parseExtractedFieldsBlock(raw)
    expect(cleanText).toBe('Ок.')
    expect(extractedFields).toBeUndefined()
  })

  it('ignores non-string/number/boolean values (e.g. nested objects) rather than passing them through', () => {
    const raw = '<<<EXTRACTED>>>{"phone":"+7777","meta":{"nested":true}}<<<END>>>'
    const { extractedFields } = parseExtractedFieldsBlock(raw)
    expect(extractedFields).toEqual({ phone: '+7777' })
  })

  it('coerces number and boolean values to strings', () => {
    const raw = '<<<EXTRACTED>>>{"budget":150000,"consultation":true}<<<END>>>'
    const { extractedFields } = parseExtractedFieldsBlock(raw)
    expect(extractedFields).toEqual({ budget: '150000', consultation: 'true' })
  })

  it('drops blank-string values instead of keeping an empty field', () => {
    const raw = '<<<EXTRACTED>>>{"phone":"  ","name":"Аружан"}<<<END>>>'
    const { extractedFields } = parseExtractedFieldsBlock(raw)
    expect(extractedFields).toEqual({ name: 'Аружан' })
  })

  it('treats a JSON array payload as no extraction', () => {
    const raw = '<<<EXTRACTED>>>["phone","name"]<<<END>>>'
    const { extractedFields } = parseExtractedFieldsBlock(raw)
    expect(extractedFields).toBeUndefined()
  })
})
