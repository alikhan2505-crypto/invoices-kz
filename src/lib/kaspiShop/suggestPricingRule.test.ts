import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: h.create } },
}))

import {
  parseSuggestionNumber, parseSuggestionText, validateSuggestion, suggestPricingRule,
  SuggestionInputError, SuggestionRejectedError,
} from './suggestPricingRule'

const reply = (text: string) => h.create.mockResolvedValueOnce({ content: [{ type: 'text', text }] })

beforeEach(() => { h.create.mockReset(); process.env.ANTHROPIC_API_KEY = 'test-key' })

describe('parseSuggestionNumber (раньше /FLOOR:\\s*(\\d+)/ превращал «12 500» в 1)', () => {
  it('целое', () => expect(parseSuggestionNumber('12500')).toBe(12500))
  it('пробел как разделитель тысяч', () => expect(parseSuggestionNumber('12 500')).toBe(12500))
  it('неразрывные пробелы', () => {
    expect(parseSuggestionNumber('12 500')).toBe(12500)
    expect(parseSuggestionNumber('1 250 000')).toBe(1250000)
  })
  it('точка и запятая как тысячные: ровно три цифры после единственного разделителя', () => {
    expect(parseSuggestionNumber('12.500')).toBe(12500)
    expect(parseSuggestionNumber('12,500')).toBe(12500)
    expect(parseSuggestionNumber('1,250,000')).toBe(1250000)
    expect(parseSuggestionNumber('1.250.000')).toBe(1250000)
  })
  it('десятичные округляются до целых тенге', () => {
    expect(parseSuggestionNumber('12,5')).toBe(13)
    expect(parseSuggestionNumber('12.4')).toBe(12)
    expect(parseSuggestionNumber('1 250,50')).toBe(1251)
    expect(parseSuggestionNumber('1,250.50')).toBe(1251)
    expect(parseSuggestionNumber('1.250,50')).toBe(1251)
  })
  it('точка в конце предложения не мешает', () => expect(parseSuggestionNumber('12500.')).toBe(12500))
  it('мусор и ноль - null', () => {
    expect(parseSuggestionNumber('abc')).toBeNull()
    expect(parseSuggestionNumber('0')).toBeNull()
    expect(parseSuggestionNumber('')).toBeNull()
  })
})

describe('parseSuggestionText', () => {
  it('обычный ответ', () => {
    expect(parseSuggestionText('FLOOR: 12500\nSTEP: 100\nREASONING: маржа 15%')).toEqual({ floorPrice: 12500, undercutStep: 100, reasoning: 'маржа 15%' })
  })
  it('«FLOOR: 12 500» даёт 12500, а не 1', () => {
    const r = parseSuggestionText('FLOOR: 12 500\nSTEP: 50\nREASONING: ок')
    expect(r.floorPrice).toBe(12500)
    expect(r.undercutStep).toBe(50)
  })
  it('в одну строку и с запятой после числа', () => {
    expect(parseSuggestionText('FLOOR: 12 500, STEP: 50')).toMatchObject({ floorPrice: 12500, undercutStep: 50 })
  })
  it('регистр не важен, REASONING необязателен', () => {
    expect(parseSuggestionText('floor: 900\nstep: 10')).toEqual({ floorPrice: 900, undercutStep: 10, reasoning: '' })
  })
  it('нет чисел: отказ с понятным текстом', () => {
    expect(() => parseSuggestionText('не знаю')).toThrow(SuggestionRejectedError)
    expect(() => parseSuggestionText('FLOOR: много\nSTEP: 5')).toThrow(/непонятном виде/)
  })
})

describe('validateSuggestion', () => {
  it('минимум не ниже себестоимости - проходит', () => {
    const s = { floorPrice: 800, undercutStep: 10, reasoning: '' }
    expect(validateSuggestion(s, 700)).toBe(s)
    expect(validateSuggestion({ ...s, floorPrice: 700 }, 700).floorPrice).toBe(700)
  })
  it('ниже себестоимости - отказ с цифрами', () => {
    expect(() => validateSuggestion({ floorPrice: 500, undercutStep: 10, reasoning: '' }, 700)).toThrow(/ниже себестоимости/)
  })
  it('шаг меньше 1 или некорректный - отказ', () => {
    expect(() => validateSuggestion({ floorPrice: 800, undercutStep: 0, reasoning: '' }, 700)).toThrow(SuggestionRejectedError)
    expect(() => validateSuggestion({ floorPrice: NaN, undercutStep: 5, reasoning: '' }, 700)).toThrow(SuggestionRejectedError)
  })
})

describe('suggestPricingRule: нужны себестоимость и цены конкурентов', () => {
  it('без себестоимости модель не вызывается', async () => {
    await expect(suggestPricingRule({ productTitle: 'Чехол', category: 'x', competitorPrices: [1400] })).rejects.toThrow(SuggestionInputError)
    await expect(suggestPricingRule({ productTitle: 'Чехол', category: 'x', competitorPrices: [1400], ownCost: 0 })).rejects.toThrow(/себестоимость/)
    await expect(suggestPricingRule({ productTitle: 'Чехол', category: 'x', competitorPrices: [1400], ownCost: NaN })).rejects.toThrow(SuggestionInputError)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('без цен конкурентов модель не вызывается (раньше получала «Цены конкурентов: тенге.»)', async () => {
    await expect(suggestPricingRule({ productTitle: 'Чехол', category: 'x', competitorPrices: [], ownCost: 700 })).rejects.toThrow(/нет цен конкурентов/)
    await expect(suggestPricingRule({ productTitle: 'Чехол', category: 'x', competitorPrices: [NaN, 0, -3], ownCost: 700 })).rejects.toThrow(SuggestionInputError)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('с данными: числа, доводы; в запрос уходят себестоимость и цены', async () => {
    reply('FLOOR: 12 500\nSTEP: 100\nREASONING: Маржа около 15%.')
    const r = await suggestPricingRule({ productTitle: 'Чехол "Pro"\nнового', category: 'Чехлы', competitorPrices: [14000, 15000], ownCost: 10000 })
    expect(r).toEqual({ floorPrice: 12500, undercutStep: 100, reasoning: 'Маржа около 15%.' })
    const prompt: string = h.create.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('14000, 15000')
    expect(prompt).toContain('Себестоимость продавца: 10000')
    // кавычки и переводы строк из названия не ломают запрос
    expect(prompt).toContain('Товар: "Чехол Pro нового"')
  })

  it('ответ ниже себестоимости отвергается', async () => {
    reply('FLOOR: 5000\nSTEP: 100\nREASONING: x')
    await expect(suggestPricingRule({ productTitle: 'Чехол', category: 'x', competitorPrices: [14000], ownCost: 10000 })).rejects.toThrow(/ниже себестоимости/)
  })

  it('«FLOOR: 12 500» больше не даёт 1 ₸', async () => {
    reply('FLOOR: 12 500\nSTEP: 100\nREASONING: x')
    const r = await suggestPricingRule({ productTitle: 'Чехол', category: 'x', competitorPrices: [14000], ownCost: 10000 })
    expect(r.floorPrice).toBe(12500)
  })

  it('без ключа API - обычная ошибка конфигурации (не ошибка пользователя)', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(suggestPricingRule({ productTitle: 'Чехол', category: 'x', competitorPrices: [1], ownCost: 1 })).rejects.toThrow('ANTHROPIC_API_KEY not configured')
  })
})
