import { describe, it, expect, vi } from 'vitest'
import {
  PRICE_CHANGE_TENGE, PRICE_MODEL_NOTE, CRON_INTERVAL_MINUTES, DEFAULT_CHECK_FREQUENCY_MINUTES, CHECK_DUE_SLACK_MINUTES,
  effectiveCheckPeriodMinutes, checkDueAfterMinutes, summarizeSchedule, lowBalanceWarning, periodLabel,
  applyNowBlockReason, applyNowSuccessText, parseApplyNowResponse, apiErrorMessage, validateProductSettings, validateBulkSettings,
  suggestionBlockReason, pluralProducts, isActiveProduct, isFloorFarResponse, floorFarConfirmText, catalogSyncShouldReload,
} from './dempingForm'

// wallet.ts тянет серверный клиент Supabase: подменяем нижний слой, нужна только константа.
vi.mock('@/lib/kaspiPay/wallet', () => ({
  getWalletBalance: vi.fn(), debitWallet: vi.fn(), checkAndSettleWalletTopup: vi.fn(),
}))
import { KASPI_SHOP_CREDIT_PRICE_TENGE } from './wallet'

describe('цена изменения цены', () => {
  it('совпадает с ценой, которую реально списывает кошелёк', () => {
    expect(PRICE_CHANGE_TENGE).toBe(KASPI_SHOP_CREDIT_PRICE_TENGE)
  })

  it('модель списаний сформулирована одной фразой: проверки бесплатны, 5 ₸ только за изменение цены ботом', () => {
    expect(PRICE_MODEL_NOTE).toBe('Проверки бесплатны, 5 ₸ списывается только за каждое изменение цены ботом.')
  })
})

describe('частота по умолчанию и реальный период проверки (запуски раз в 10 минут)', () => {
  it('новые товары проверяются раз в час: по умолчанию 60, и подпись говорит 60, а не 70', () => {
    expect(DEFAULT_CHECK_FREQUENCY_MINUTES).toBe(60)
    expect(effectiveCheckPeriodMinutes(60)).toBe(60)
    expect(periodLabel(effectiveCheckPeriodMinutes(60), effectiveCheckPeriodMinutes(60))).toBe('примерно раз в 60 мин')
  })

  it('частота округляется вверх до целого числа запусков (тиков)', () => {
    expect(CRON_INTERVAL_MINUTES).toBe(10)
    expect(effectiveCheckPeriodMinutes(15)).toBe(20)
    expect(effectiveCheckPeriodMinutes(10)).toBe(10)
    expect(effectiveCheckPeriodMinutes(20)).toBe(20)
    expect(effectiveCheckPeriodMinutes(30)).toBe(30)
    expect(effectiveCheckPeriodMinutes(5)).toBe(10)
    expect(effectiveCheckPeriodMinutes(12)).toBe(20)
    expect(effectiveCheckPeriodMinutes(21)).toBe(30)
    expect(effectiveCheckPeriodMinutes(61)).toBe(70)
  })

  it('чаще раза в 10 минут не бывает; пустое и мусор = значение по умолчанию (60)', () => {
    expect(effectiveCheckPeriodMinutes(1)).toBe(10)
    expect(effectiveCheckPeriodMinutes(null)).toBe(60)
    expect(effectiveCheckPeriodMinutes(undefined)).toBe(60)
    expect(effectiveCheckPeriodMinutes(NaN)).toBe(60)
    expect(effectiveCheckPeriodMinutes(-3)).toBe(60)
  })

  it('порог «пора проверять» на 9 минут раньше границы запуска: 60 -> 51, 15 -> 11', () => {
    expect(CHECK_DUE_SLACK_MINUTES).toBe(9)
    expect(checkDueAfterMinutes(60)).toBe(51)
    expect(checkDueAfterMinutes(15)).toBe(11)
    expect(checkDueAfterMinutes(10)).toBe(1)
  })

  it('совпадает с настоящим isCheckDue: тики cron каждые 10 минут, запись last_checked_at в любую из первых 9 минут запуска', async () => {
    const { isCheckDue } = await import('./checkCycle')
    const MIN = 60_000
    for (const freq of [5, 10, 15, 20, 25, 30, 45, 60, 90, 120]) {
      for (const writeOffset of [0, 1, 2, 5, 8, 9]) {
        let tick = 10
        while (!isCheckDue(new Date(writeOffset * MIN).toISOString(), freq, tick * MIN)) tick += 10
        // реальный период между тиками равен подписи на странице при любой записи внутри запуска
        expect(tick).toBe(effectiveCheckPeriodMinutes(freq))
      }
    }
  })

  it('60 минут: следующий тик через час подхватывает товар (раньше только через 70)', async () => {
    const { isCheckDue } = await import('./checkCycle')
    const MIN = 60_000
    const wroteAt = 3 * MIN // запись через 3 минуты после тика
    expect(isCheckDue(new Date(wroteAt).toISOString(), 60, 50 * MIN)).toBe(false) // тик +50
    expect(isCheckDue(new Date(wroteAt).toISOString(), 60, 60 * MIN)).toBe(true) // тик +60
  })
})

describe('summarizeSchedule', () => {
  it('считает только включённые товары', () => {
    const e = summarizeSchedule([
      { enabled: true, check_frequency_minutes: 60 },
      { enabled: true, check_frequency_minutes: 60 },
      { enabled: false, check_frequency_minutes: 60 },
    ])
    expect(e).toEqual({ count: 2, minPeriod: 60, maxPeriod: 60 })
  })

  it('разная частота: диапазон периода', () => {
    const e = summarizeSchedule([
      { enabled: true, check_frequency_minutes: 10 },
      { enabled: true, check_frequency_minutes: 60 },
    ])
    expect(e).toEqual({ count: 2, minPeriod: 10, maxPeriod: 60 })
    expect(periodLabel(e.minPeriod, e.maxPeriod)).toBe('примерно раз в 10-60 мин, в зависимости от товара')
  })

  it('нет включённых: нули', () => {
    expect(summarizeSchedule([{ enabled: false }])).toEqual({ count: 0, minPeriod: 0, maxPeriod: 0 })
    expect(summarizeSchedule([])).toEqual({ count: 0, minPeriod: 0, maxPeriod: 0 })
  })

  it('в сводке нет денег: проверка бесплатна, число изменений цены заранее не известно', () => {
    expect(Object.keys(summarizeSchedule([{ enabled: true, check_frequency_minutes: 60 }])).sort()).toEqual(['count', 'maxPeriod', 'minPeriod'])
  })
})

describe('товары, снятые с продажи, не считаются активными', () => {
  it('available_for_sale = false не считается; null и пусто считаются в продаже', () => {
    const e = summarizeSchedule([
      { enabled: true, available_for_sale: true, check_frequency_minutes: 60 },
      { enabled: true, available_for_sale: null, check_frequency_minutes: 60 },
      { enabled: true, check_frequency_minutes: 60 },
      { enabled: true, available_for_sale: false, check_frequency_minutes: 60 },
      { enabled: true, available_for_sale: false, check_frequency_minutes: 60 },
    ])
    expect(e.count).toBe(3)
  })

  it('isActiveProduct совпадает с серверным условием «Активных» и apply-now (enabled и не false)', () => {
    expect(isActiveProduct({ enabled: true })).toBe(true)
    expect(isActiveProduct({ enabled: true, available_for_sale: false })).toBe(false)
    expect(isActiveProduct({ enabled: false, available_for_sale: true })).toBe(false)
  })

  it('плашка низкого баланса строится только по товарам в продаже', () => {
    const onlyOffSale = summarizeSchedule([{ enabled: true, available_for_sale: false }])
    expect(lowBalanceWarning(0, onlyOffSale, false)).toBeNull()
  })
})

describe('floor_far_above_price: подтверждение', () => {
  it('минимум выше цены: вопрос с числами', () => {
    const data = { code: 'floor_far_above_price', field: 'floor_price', floorPrice: 60000, ownPrice: 2000, factor: 3 }
    expect(isFloorFarResponse(400, data)).toBe(true)
    const t = floorFarConfirmText(data)!
    expect(t).toContain('Минимум 60')
    expect(t).toContain('выше текущей цены 2')
    expect(t).toContain('более чем в 3 раза')
    expect(t).toContain('Бот сделает это при следующей проверке, если товар включён')
    expect(t).toContain('цена поднимется до минимума, за это изменение спишется 5 ₸. Сохранить?')
    expect(t).not.toContain('сразу')
  })

  it('минимум сильно ниже цены (потерянный ноль): процент и вопрос про ноль', () => {
    const t = floorFarConfirmText({ code: 'floor_far_above_price', field: 'floor_price', direction: 'below', floorPrice: 7000, ownPrice: 78990, factor: 3 })!
    expect(t).toContain('это 9% от текущей цены')
    expect(t).toContain('бот может опустить цену до')
    expect(t).toContain('Не пропущен ли ноль?')
  })

  it('минимум чуть выше цены: бот поднимет цену, без слов «более чем в»', () => {
    const t = floorFarConfirmText({ code: 'floor_far_above_price', field: 'floor_price', direction: 'above', floorPrice: 2100, ownPrice: 2000, factor: 3 })!
    expect(t).toContain('выше текущей цены')
    expect(t).toContain('бот поднимет цену до минимума')
    expect(t).not.toContain('более чем')
  })

  it('максимум ниже цены: вопрос про максимум', () => {
    const t = floorFarConfirmText({ code: 'floor_far_above_price', field: 'max_price', maxPrice: 600, ownPrice: 2000, factor: 3 })!
    expect(t).toContain('Максимум 600 ₸ ниже текущей цены')
    expect(t).toContain('Бот сделает это при следующей проверке, если товар включён')
    expect(t).toContain('цена опустится до максимума')
    expect(t).not.toContain('сразу')
  })

  it('другие ответы и ответ без чисел не открывают подтверждение', () => {
    expect(isFloorFarResponse(500, { code: 'floor_far_above_price' })).toBe(false)
    expect(isFloorFarResponse(400, { error: 'x' })).toBe(false)
    expect(floorFarConfirmText({ code: 'floor_far_above_price', field: 'floor_price' })).toBeNull()
  })
})

describe('«Обновить каталог»: когда перечитывать список', () => {
  it('успех и неполный импорт с записанными товарами: да', () => {
    expect(catalogSyncShouldReload(true, { ok: true, imported: 0 })).toBe(true)
    expect(catalogSyncShouldReload(false, { partial: true, imported: 200 })).toBe(true)
  })
  it('полный провал: нет', () => {
    expect(catalogSyncShouldReload(false, { partial: true, imported: 0 })).toBe(false)
    expect(catalogSyncShouldReload(false, { error: 'x' })).toBe(false)
    expect(catalogSyncShouldReload(false, {})).toBe(false)
  })
})

describe('низкий баланс', () => {
  const sched = summarizeSchedule([{ enabled: true, check_frequency_minutes: 60 }, { enabled: true, check_frequency_minutes: 60 }])

  it('меньше цены одного изменения: плашка «Баланс меньше 5 ₸: бот не сможет менять цены»', () => {
    const w = lowBalanceWarning(4, sched, false)
    expect(w?.title).toBe('Баланс меньше 5 ₸: бот не сможет менять цены')
    expect(w?.message).toContain('Сейчас на балансе 4 ₸')
    expect(w?.message).toContain('Проверки бесплатны, 5 ₸ списывается только за каждое изменение цены ботом.')
    expect(w?.message).not.toContain('в сутки')
  })

  it('ровно 5 ₸ и больше: плашки нет (оценки «хватит на N часов» больше нет, она была выдумана)', () => {
    expect(lowBalanceWarning(5, sched, false)).toBeNull()
    expect(lowBalanceWarning(300, sched, false)).toBeNull()
    expect(lowBalanceWarning(5000, sched, false)).toBeNull()
  })

  it('на паузе или без включённых товаров бот ничего не делает, значит и плашки нет', () => {
    expect(lowBalanceWarning(0, sched, true)).toBeNull()
    expect(lowBalanceWarning(0, summarizeSchedule([]), false)).toBeNull()
  })
})

describe('«Применить сейчас»', () => {
  const ok = { paused: false, sessionStatus: 'active', activeCount: 2, balance: 100 }

  it('всё в порядке: можно нажимать', () => {
    expect(applyNowBlockReason(ok)).toBeNull()
    expect(applyNowBlockReason({ ...ok, sessionStatus: null })).toBeNull()
  })

  it('на паузе: кнопка недоступна, причина названа', () => {
    expect(applyNowBlockReason({ ...ok, paused: true })).toContain('Демпинг на паузе')
  })

  it('сессия Kaspi истекла: кнопка недоступна, причина названа', () => {
    expect(applyNowBlockReason({ ...ok, sessionStatus: 'session_expired' })).toContain('Сессия Kaspi истекла')
  })

  it('нет включённых товаров в продаже и баланс меньше 5 ₸ тоже причины', () => {
    expect(applyNowBlockReason({ ...ok, activeCount: 0 })).toContain('Нет включённых товаров')
    expect(applyNowBlockReason({ ...ok, balance: 4 })).toContain('Баланс меньше 5 ₸')
    expect(applyNowBlockReason({ ...ok, balance: 5 })).toBeNull()
  })

  it('пауза важнее остальных причин', () => {
    expect(applyNowBlockReason({ paused: true, sessionStatus: 'session_expired', activeCount: 0, balance: 0 })).toContain('Демпинг на паузе')
  })

  it('ответ сервера {count} и старый {queued}: число товаров, стоимости нет', () => {
    expect(parseApplyNowResponse({ ok: true, count: 3 })).toEqual({ count: 3 })
    expect(parseApplyNowResponse({ ok: true, queued: 4 })).toEqual({ count: 4 })
    expect(parseApplyNowResponse({ ok: true, count: 3, cost: 15 })).toEqual({ count: 3 })
  })

  it('пустой или кривой ответ: неизвестно, ничего не выдумываем', () => {
    expect(parseApplyNowResponse({})).toEqual({ count: null })
    expect(parseApplyNowResponse(null)).toEqual({ count: null })
    expect(parseApplyNowResponse({ count: 'много' })).toEqual({ count: null })
  })

  it('текст успеха: проверка запущена, честно про сроки и про то, что 5 ₸ берётся только за изменение цены', () => {
    const t = applyNowSuccessText({ count: 2 })
    expect(t).toContain('Проверка запущена: 2 товара.')
    expect(t).toContain('несколько минут')
    expect(t).toContain('Проверки бесплатны, 5 ₸ списывается только за каждое изменение цены ботом.')
    expect(t).not.toContain('× 5')
    expect(t).not.toContain('спишется с баланса')
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
