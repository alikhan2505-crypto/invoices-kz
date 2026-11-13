import { describe, it, expect } from 'vitest'
import { formatAgo, freshnessLine } from './productFreshness'

const NOW = Date.parse('2026-11-13T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatAgo', () => {
  it('ступени: только что, минуты, часы, дни', () => {
    expect(formatAgo(ago(20_000), NOW)).toBe('только что')
    expect(formatAgo(ago(59_999), NOW)).toBe('только что')
    expect(formatAgo(ago(MIN), NOW)).toBe('1 мин назад')
    expect(formatAgo(ago(59 * MIN + 59_000), NOW)).toBe('59 мин назад')
    expect(formatAgo(ago(HOUR), NOW)).toBe('1 ч назад')
    expect(formatAgo(ago(23 * HOUR + 59 * MIN), NOW)).toBe('23 ч назад')
    expect(formatAgo(ago(DAY), NOW)).toBe('1 день назад')
    expect(formatAgo(ago(2 * DAY), NOW)).toBe('2 дня назад')
    expect(formatAgo(ago(5 * DAY), NOW)).toBe('5 дней назад')
    expect(formatAgo(ago(11 * DAY), NOW)).toBe('11 дней назад')
    expect(formatAgo(ago(21 * DAY), NOW)).toBe('21 день назад')
    expect(formatAgo(ago(112 * DAY), NOW)).toBe('112 дней назад')
  })

  it('будущее (расхождение часов) читается как «только что»; пусто и мусор дают null', () => {
    expect(formatAgo(new Date(NOW + 30_000).toISOString(), NOW)).toBe('только что')
    expect(formatAgo(null, NOW)).toBeNull()
    expect(formatAgo(undefined, NOW)).toBeNull()
    expect(formatAgo('', NOW)).toBeNull()
    expect(formatAgo('не дата', NOW)).toBeNull()
  })
})

describe('freshnessLine', () => {
  const base = { enabled: true, available_for_sale: true, last_checked_at: ago(12 * MIN) }

  it('включённый товар: проверка и последнее изменение цены с диапазоном', () => {
    expect(freshnessLine({ ...base, last_price_change_at: ago(2 * HOUR), last_price_change_from: 750, last_price_change_to: 600 }, NOW))
      .toBe('Проверено 12 мин назад · цена изменена 2 ч назад (750 → 600 ₸)')
  })

  it('изменение без цен в диапазоне: только время', () => {
    expect(freshnessLine({ ...base, last_price_change_at: ago(3 * DAY) }, NOW))
      .toBe('Проверено 12 мин назад · цена изменена 3 дня назад')
  })

  it('цену не меняли: так и пишем, а не молчим', () => {
    expect(freshnessLine(base, NOW)).toBe('Проверено 12 мин назад · цену бот ещё не менял')
  })

  it('ни разу не проверялся: без «цену не менял» (непонятно, о чём речь)', () => {
    expect(freshnessLine({ enabled: true, last_checked_at: null }, NOW)).toBe('Ещё не проверялся')
  })

  it('на паузе или снят с продажи: строки нет, бот этот товар не смотрит', () => {
    expect(freshnessLine({ ...base, enabled: false }, NOW)).toBeNull()
    expect(freshnessLine({ ...base, available_for_sale: false }, NOW)).toBeNull()
  })

  it('пусто у старых строк available_for_sale считается «в продаже»', () => {
    expect(freshnessLine({ enabled: true, last_checked_at: ago(HOUR), available_for_sale: null }, NOW)).toContain('Проверено 1 ч назад')
  })
})
