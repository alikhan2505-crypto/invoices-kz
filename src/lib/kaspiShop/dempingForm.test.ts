import { describe, it, expect, vi } from 'vitest'
import {
  CHECK_PRICE_TENGE, CRON_INTERVAL_MINUTES, effectiveCheckPeriodMinutes, checksPerDay, dailyCostPerProduct,
  estimateDailyCost, lowBalanceWarning, runwayHours, runwayLabel, periodLabel, applyNowConfirmText,
  applyNowSuccessText, parseApplyNowResponse, apiErrorMessage, validateProductSettings, validateBulkSettings,
  suggestionBlockReason, pluralProducts,
} from './dempingForm'

// wallet.ts тянет серверный клиент Supabase: подменяем нижний слой, нужна только константа.
vi.mock('@/lib/kaspiPay/wallet', () => ({
  getWalletBalance: vi.fn(), debitWallet: vi.fn(), checkAndSettleWalletTopup: vi.fn(),
}))
import { KASPI_SHOP_CREDIT_PRICE_TENGE } from './wallet'

describe('цена проверки', () => {
  it('совпадает с ценой, которую реально списывает кошелёк', () => {
    expect(CHECK_PRICE_TENGE).toBe(KASPI_SHOP_CREDIT_PRICE_TENGE)
  })
})

describe('реальный период проверки (запуски раз в 10 минут)', () => {
  it('15 минут в настройке = около 20 на деле', () => {
    expect(CRON_INTERVAL_MINUTES).toBe(10)
    expect(effectiveCheckPeriodMinutes(15)).toBe(20)
  })

  it('кратные 10 остаются, остальные округляются вверх до следующего запуска', () => {
    expect(effectiveCheckPeriodMinutes(10)).toBe(10)
    expect(effectiveCheckPeriodMinutes(20)).toBe(20)
    expect(effectiveCheckPeriodMinutes(21)).toBe(30)
    expect(effectiveCheckPeriodMinutes(60)).toBe(60)
  })

  it('чаще раза в 10 минут не бывает; пустое и мусор = значение по умолчанию (15, то есть 20)', () => {
    expect(effectiveCheckPeriodMinutes(5)).toBe(10)
    expect(effectiveCheckPeriodMinutes(1)).toBe(10)
    expect(effectiveCheckPeriodMinutes(null)).toBe(20)
    expect(effectiveCheckPeriodMinutes(undefined)).toBe(20)
    expect(effectiveCheckPeriodMinutes(NaN)).toBe(20)
    expect(effectiveCheckPeriodMinutes(-3)).toBe(20)
  })

  it('72 проверки в сутки и 360 ₸ на товар при настройке по умолчанию', () => {
    expect(checksPerDay(15)).toBe(72)
    expect(dailyCostPerProduct(15)).toBe(360)
  })
})

describe('estimateDailyCost', () => {
  it('считает только включённые товары', () => {
    const e = estimateDailyCost([
      { enabled: true, check_frequency_minutes: 15 },
      { enabled: true, check_frequency_minutes: 15 },
      { enabled: false, check_frequency_minutes: 15 },
    ])
    expect(e).toEqual({ count: 2, dailyCost: 720, minPeriod: 20, maxPeriod: 20 })
  })

  it('разная частота: диапазон периода', () => {
    const e = estimateDailyCost([
      { enabled: true, check_frequency_minutes: 10 },
      { enabled: true, check_frequency_minutes: 60 },
    ])
    expect(e.minPeriod).toBe(10)
    expect(e.maxPeriod).toBe(60)
    expect(e.dailyCost).toBe(144 * 5 + 24 * 5)
    expect(periodLabel(e.minPeriod, e.maxPeriod)).toBe('от 10 до 60 мин')
    expect(periodLabel(20, 20)).toBe('около 20 мин')
  })

  it('нет включённых: нули', () => {
    expect(estimateDailyCost([{ enabled: false }])).toEqual({ count: 0, dailyCost: 0, minPeriod: 0, maxPeriod: 0 })
    expect(estimateDailyCost([])).toEqual({ count: 0, dailyCost: 0, minPeriod: 0, maxPeriod: 0 })
  })

  it('100 товаров в массовом режиме: 36 000 ₸ в сутки (пример из аудита)', () => {
    const e = estimateDailyCost(Array.from({ length: 100 }, () => ({ enabled: true, check_frequency_minutes: 15 })))
    expect(e.dailyCost).toBe(36000)
  })
})

describe('низкий баланс', () => {
  const est = estimateDailyCost([{ enabled: true, check_frequency_minutes: 15 }, { enabled: true, check_frequency_minutes: 15 }])

  it('меньше цены одной проверки: бот остановлен', () => {
    const w = lowBalanceWarning(4, est, false)
    expect(w?.level).toBe('empty')
    expect(w?.message).toContain('проверки цен остановлены')
  })

  it('меньше суток работы: предупреждение с оценкой срока', () => {
    const w = lowBalanceWarning(300, est, false)
    expect(w?.level).toBe('low')
    expect(w?.message).toContain('Баланса хватит около 10 ч')
    expect(w?.message).toContain('720')
  })

  it('хватает больше чем на сутки: ничего', () => {
    expect(lowBalanceWarning(720, est, false)).toBeNull()
    expect(lowBalanceWarning(5000, est, false)).toBeNull()
  })

  it('на паузе или без включённых товаров списаний нет, значит и плашки нет', () => {
    expect(lowBalanceWarning(0, est, true)).toBeNull()
    expect(lowBalanceWarning(0, estimateDailyCost([]), false)).toBeNull()
  })

  it('runwayHours и подпись', () => {
    expect(runwayHours(720, 720)).toBe(24)
    expect(runwayHours(100, 0)).toBeNull()
    expect(runwayHours(-5, 720)).toBe(0)
    expect(runwayLabel(0.4)).toBe('меньше часа')
    expect(runwayLabel(10.9)).toBe('около 10 ч')
    expect(runwayLabel(72)).toBe('около 3 дн.')
  })
})

describe('«Применить сейчас»', () => {
  it('текст подтверждения: N товаров × 5 ₸ = X ₸', () => {
    const t = applyNowConfirmText(137, 100000)
    expect(t.replace(/[  ]/g, ' ')).toContain('137 товаров × 5 ₸ = 685 ₸ спишется с баланса')
    expect(t).toContain('несколько минут')
  })

  it('баланса не хватает на всех: говорит, на сколько хватит', () => {
    const t = applyNowConfirmText(10, 23).replace(/[  ]/g, ' ')
    expect(t).toContain('10 товаров × 5 ₸ = 50 ₸')
    expect(t).toContain('хватит примерно на 4 товара')
  })

  it('ответ сервера {count, cost}', () => {
    expect(parseApplyNowResponse({ ok: true, count: 3, cost: 15 })).toEqual({ count: 3, cost: 15 })
  })

  it('старый ответ {queued} читается как count; cost считается', () => {
    expect(parseApplyNowResponse({ ok: true, queued: 4 })).toEqual({ count: 4, cost: 20 })
  })

  it('пустой или кривой ответ: неизвестно, ничего не выдумываем', () => {
    expect(parseApplyNowResponse({})).toEqual({ count: null, cost: null })
    expect(parseApplyNowResponse(null)).toEqual({ count: null, cost: null })
    expect(parseApplyNowResponse({ count: 'много', cost: -1 })).toEqual({ count: null, cost: null })
  })

  it('текст успеха честен про сроки', () => {
    const t = applyNowSuccessText({ count: 2, cost: 10 })
    expect(t).toContain('Проверка запущена: 2 товара × 5 ₸ = 10 ₸.')
    expect(t).toContain('несколько минут')
    expect(t).not.toContain('в течение минуты')
    expect(applyNowSuccessText({})).toMatch(/^Проверка запущена\. Цены обновятся не сразу/)
  })
})

describe('apiErrorMessage', () => {
  it('слова сервера важнее всего', () => {
    expect(apiErrorMessage(400, { error: 'max_price должен быть больше floor_price' }, 'запас')).toBe('max_price должен быть больше floor_price')
  })
  it('без слов сервера: по коду ответа', () => {
    expect(apiErrorMessage(401, {}, 'x')).toContain('Вход устарел')
    expect(apiErrorMessage(403, null, 'x')).toContain('Нет доступа')
    expect(apiErrorMessage(500, {}, 'x')).toContain('Сервер временно не отвечает')
    expect(apiErrorMessage(418, {}, 'запас')).toBe('запас')
    expect(apiErrorMessage(400, { error: '   ' }, 'запас')).toBe('запас')
  })
})

describe('validateProductSettings', () => {
  const base = { floorPrice: '1000', maxPrice: '', undercutStep: '100' }

  it('нормальная форма', () => {
    expect(validateProductSettings(base)).toEqual({ ok: true, floor: 1000, max: null, step: 100 })
  })

  it('пустой минимум - отказ, а не 0', () => {
    const r = validateProductSettings({ ...base, floorPrice: '' })
    expect(r).toEqual({ ok: false, error: 'Минимальная цена: заполните поле.' })
  })

  it('минимум 0 и отрицательный отвергаются', () => {
    expect(validateProductSettings({ ...base, floorPrice: '0' }).ok).toBe(false)
    expect(validateProductSettings({ ...base, floorPrice: '-5' }).ok).toBe(false)
  })

  it('запятая и пробелы в числах', () => {
    expect(validateProductSettings({ floorPrice: '1 250,5', maxPrice: '2 000', undercutStep: '50,5' }))
      .toEqual({ ok: true, floor: 1250.5, max: 2000, step: 50.5 })
  })

  it('максимум должен быть выше минимума', () => {
    expect(validateProductSettings({ ...base, maxPrice: '900' })).toEqual({ ok: false, error: 'Максимальная цена должна быть больше минимальной.' })
    expect(validateProductSettings({ ...base, maxPrice: '1000' }).ok).toBe(false)
  })

  it('непонятный максимум - отказ, пустой - null', () => {
    expect(validateProductSettings({ ...base, maxPrice: 'abc' }).ok).toBe(false)
    expect(validateProductSettings({ ...base, maxPrice: '  ' })).toMatchObject({ ok: true, max: null })
  })

  it('шаг обязателен, 0 допустим, отрицательный нет', () => {
    expect(validateProductSettings({ ...base, undercutStep: '' }).ok).toBe(false)
    expect(validateProductSettings({ ...base, undercutStep: '0' })).toMatchObject({ ok: true, step: 0 })
    expect(validateProductSettings({ ...base, undercutStep: '-100' }).ok).toBe(false)
  })
})

describe('validateBulkSettings', () => {
  const base = { floorPrice: '1000', maxPrice: '', undercutStep: '100', frequency: '15' }
  it('нормально', () => {
    expect(validateBulkSettings(base)).toEqual({ ok: true, floor: 1000, max: null, step: 100, frequency: 15 })
  })
  it('частота: целое не меньше 5', () => {
    expect(validateBulkSettings({ ...base, frequency: '1' }).ok).toBe(false)
    expect(validateBulkSettings({ ...base, frequency: '12,5' }).ok).toBe(false)
    expect(validateBulkSettings({ ...base, frequency: '' }).ok).toBe(false)
    expect(validateBulkSettings({ ...base, frequency: '5' })).toMatchObject({ ok: true, frequency: 5 })
  })
  it('ошибка общей части приходит первой', () => {
    expect(validateBulkSettings({ ...base, floorPrice: '' }).ok).toBe(false)
  })
})

describe('suggestionBlockReason', () => {
  it('готово: есть себестоимость и цена конкурента', () => {
    expect(suggestionBlockReason({ cogs_amount: 500, last_competitor_price: 1400 })).toBeNull()
  })
  it('цена конкурента может прийти из городов', () => {
    expect(suggestionBlockReason({ cogs_amount: 500, last_competitor_price: null }, true)).toBeNull()
  })
  it('нет себестоимости', () => {
    expect(suggestionBlockReason({ cogs_amount: null, last_competitor_price: 1400 })).toContain('себестоимость')
    expect(suggestionBlockReason({ cogs_amount: 0, last_competitor_price: 1400 })).toContain('себестоимость')
  })
  it('нет конкурентов', () => {
    expect(suggestionBlockReason({ cogs_amount: 500, last_competitor_price: null })).toContain('нет цен конкурентов')
    expect(suggestionBlockReason({ cogs_amount: 500, last_competitor_price: 0 })).toContain('нет цен конкурентов')
  })
  it('нет ни того ни другого', () => {
    expect(suggestionBlockReason({})).toContain('Нужны себестоимость')
  })
})

describe('склонение', () => {
  it('товар / товара / товаров', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 101, 111].map(pluralProducts)).toEqual(
      ['товар', 'товара', 'товаров', 'товаров', 'товаров', 'товар', 'товара', 'товаров', 'товар', 'товаров'],
    )
  })
})
