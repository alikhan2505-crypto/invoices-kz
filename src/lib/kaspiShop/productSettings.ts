// Серверная проверка денежных настроек товара в «Демпинге» (аудит Kaspi
// 06.11.2026, K7/K16/K18). Чистые функции без базы: их используют PATCH, POST и
// bulk в /api/kaspi-shop/products, а клиентская форма (dempingForm.ts) делает
// лишь быстрый и понятный отказ до отправки -- настоящая защита здесь.
//
// Правила, которые раньше не проверялись нигде:
//  - минимальная цена (floor_price) -- конечное число > 0: пустое поле, 0, минус,
//    NaN и строки не проходят (иначе бот уронил бы цену до нуля, а пол --
//    единственная защита продавца);
//  - шаг (undercut_step) -- конечное число >= 0 (минус превращал «ниже конкурента»
//    в «выше конкурента»);
//  - максимум (max_price) -- null (без потолка) или число строго выше пола;
//    сравнивается с полом, который СТОИТ В БАЗЕ, если пришёл только один из двух;
//  - частота -- целое число минут не меньше минимума, который предлагает форма;
//  - стратегия -- одна из четырёх известных (неизвестная молча вела себя как be_second).
// Деньги в тенге хранятся целыми: дробное округляется.
import { MIN_CHECK_FREQUENCY_MINUTES, DEFAULT_CHECK_FREQUENCY_MINUTES } from './dempingForm'

export { MIN_CHECK_FREQUENCY_MINUTES }

export const DEMPING_STRATEGIES = ['undercut_leader', 'match_leader', 'stay_above_leader', 'be_second'] as const
export type DempingStrategyValue = (typeof DEMPING_STRATEGIES)[number]

// Новые товары проверяются раз в час (правило основателя 07.11.2026); у существующих своя частота.
export const DEFAULT_CHECK_FREQUENCY = DEFAULT_CHECK_FREQUENCY_MINUTES

// Число из тела запроса: настоящее число или строка из одного числа ("1250").
// «1 250» и «12,5» сервер не угадывает (клиент разбирает их сам), true/null/[] не числа.
export function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function isDempingStrategy(v: unknown): v is DempingStrategyValue {
  return typeof v === 'string' && (DEMPING_STRATEGIES as readonly string[]).includes(v)
}

type Check<T> = { ok: true; value: T } | { ok: false; error: string }

export function checkFloorPrice(v: unknown, label = 'floor_price'): Check<number> {
  const n = toFiniteNumber(v)
  if (n === null || n <= 0 || Math.round(n) < 1) return { ok: false, error: `${label} должен быть числом больше нуля` }
  return { ok: true, value: Math.round(n) }
}

// null / '' / undefined = «без потолка» (только там, где вызывающий это допускает).
export function checkMaxPrice(v: unknown, floor: number | null, label = 'max_price'): Check<number | null> {
  if (v === null || v === undefined || v === '') return { ok: true, value: null }
  const n = toFiniteNumber(v)
  if (n === null || n <= 0) return { ok: false, error: `${label} должен быть числом больше нуля или пустым` }
  const rounded = Math.round(n)
  if (floor !== null && rounded <= floor) return { ok: false, error: `${label} должен быть больше floor_price` }
  return { ok: true, value: rounded }
}

export function checkUndercutStep(v: unknown, label = 'undercut_step'): Check<number> {
  const n = toFiniteNumber(v)
  if (n === null || n < 0) return { ok: false, error: `${label} должен быть числом не меньше нуля` }
  return { ok: true, value: Math.round(n) }
}

export function checkFrequency(v: unknown, label = 'check_frequency_minutes'): Check<number> {
  const n = toFiniteNumber(v)
  if (n === null || !Number.isInteger(n) || n < MIN_CHECK_FREQUENCY_MINUTES) {
    return { ok: false, error: `${label} должен быть целым числом минут не меньше ${MIN_CHECK_FREQUENCY_MINUTES}` }
  }
  return { ok: true, value: n }
}

export function checkStockCount(v: unknown, label = 'stock_count'): Check<number> {
  const n = toFiniteNumber(v)
  if (n === null || n < 0) return { ok: false, error: `${label} должен быть числом не меньше нуля` }
  return { ok: true, value: Math.round(n) }
}

function checkStringArray(v: unknown, label: string): Check<string[]> {
  if (!Array.isArray(v) || v.length > 1000 || !v.every(x => typeof x === 'string' && x.length > 0 && x.length < 200)) {
    return { ok: false, error: `${label} должен быть списком строк` }
  }
  return { ok: true, value: v as string[] }
}

export type StoredProductSettings = { floor_price?: unknown; max_price?: unknown; own_current_price?: unknown }

// Пол/максимум, сильно расходящиеся с текущей ценой товара, почти всегда опечатка
// (50000 вместо 5000): бот на следующем цикле (через ~10 минут) поставил бы такую
// цену в Kaspi. Порог -- во сколько раз пол выше цены (или цена выше максимума).
// Продавец может подтвердить осознанно: тело PATCH с confirmFloor: true.
export const FLOOR_FAR_FACTOR = 3
// Пол ниже этой доли цены тоже почти всегда опечатка (7000 вместо 70 000): бот честно
// уронил бы цену до него (прогон воронки Kaspi 07.11.2026). Пол выше цены (даже ненамного)
// поднимает цену при следующей проверке, поэтому тоже просит подтверждения.
export const FLOOR_LOW_SHARE = 0.5
export const FLOOR_FAR_ERROR_CODE = 'floor_far_above_price'

export type FloorFarDetails = {
  field: 'floor_price' | 'max_price'
  // above: пол выше цены (бот поднимет цену); below: пол сильно ниже цены (бот может уронить цену до него).
  direction?: 'above' | 'below'
  floorPrice: number | null
  maxPrice: number | null
  ownPrice: number
  factor: number
}
export type PatchValidation =
  | { ok: true; patch: Record<string, any> }
  | { ok: false; error: string; code?: typeof FLOOR_FAR_ERROR_CODE; details?: FloorFarDetails }

// Что можно менять PATCH-ом (остальные ключи тела игнорируются, как и раньше).
const PATCH_KEYS = ['floor_price', 'undercut_step', 'check_frequency_minutes', 'enabled', 'stock_count', 'demping_strategy', 'excluded_city_codes', 'excluded_merchant_ids', 'max_price'] as const

// `stored` -- текущие значения строки в базе: если пришёл только один из пары
// пол/максимум, второй берётся оттуда.
export function validateProductPatch(updates: Record<string, unknown>, stored: StoredProductSettings): PatchValidation {
  const patch: Record<string, any> = {}
  for (const key of PATCH_KEYS) if (key in updates) patch[key] = updates[key]
  if (Object.keys(patch).length === 0) return { ok: false, error: 'no updatable fields provided' }

  if ('floor_price' in patch) {
    const r = checkFloorPrice(patch.floor_price)
    if (!r.ok) return r
    patch.floor_price = r.value
  }
  if ('undercut_step' in patch) {
    const r = checkUndercutStep(patch.undercut_step)
    if (!r.ok) return r
    patch.undercut_step = r.value
  }
  if ('check_frequency_minutes' in patch) {
    const r = checkFrequency(patch.check_frequency_minutes)
    if (!r.ok) return r
    patch.check_frequency_minutes = r.value
  }
  if ('stock_count' in patch) {
    const r = checkStockCount(patch.stock_count)
    if (!r.ok) return r
    patch.stock_count = r.value
  }
  if ('demping_strategy' in patch && !isDempingStrategy(patch.demping_strategy)) {
    return { ok: false, error: `demping_strategy должен быть одним из: ${DEMPING_STRATEGIES.join(', ')}` }
  }
  if ('enabled' in patch && typeof patch.enabled !== 'boolean') {
    return { ok: false, error: 'enabled должен быть true или false' }
  }
  for (const key of ['excluded_city_codes', 'excluded_merchant_ids'] as const) {
    if (key in patch) {
      const r = checkStringArray(patch[key], key)
      if (!r.ok) return r
    }
  }

  // Пол и максимум проверяем парой: недостающую половину берём из базы.
  const storedFloor = toFiniteNumber(stored.floor_price)
  const effectiveFloor = 'floor_price' in patch ? (patch.floor_price as number) : (storedFloor !== null && storedFloor > 0 ? storedFloor : null)
  if ('max_price' in patch) {
    const r = checkMaxPrice(patch.max_price, effectiveFloor)
    if (!r.ok) return r
    patch.max_price = r.value
  } else if ('floor_price' in patch) {
    // Пол подняли, максимум остался прежним: он по-прежнему обязан быть выше.
    const storedMax = toFiniteNumber(stored.max_price)
    if (storedMax !== null && storedMax > 0 && storedMax <= patch.floor_price) {
      return { ok: false, error: 'max_price должен быть больше floor_price' }
    }
  }

  // Пол сильно выше текущей цены (или максимум сильно ниже неё) -- вероятная
  // опечатка. Проверяем только то, что пришло в этом запросе, и только когда у
  // товара известна текущая цена; confirmFloor: true -- осознанное подтверждение.
  // Форма шлёт ВСЕ поля при каждом сохранении, поэтому «пришло в запросе» не значит
  // «меняется»: проверяем пол/максимум, только если значение отличается от того, что
  // уже стоит в базе (иначе правка шага или частоты упиралась бы в старый пол,
  // который продавец когда-то сознательно подтвердил).
  const ownPrice = toFiniteNumber(stored.own_current_price)
  if (updates.confirmFloor !== true && ownPrice !== null && ownPrice > 0) {
    const storedFloorRounded = storedFloor !== null ? Math.round(storedFloor) : null
    const storedMaxRaw = toFiniteNumber(stored.max_price)
    const storedMaxRounded = storedMaxRaw !== null && storedMaxRaw > 0 ? Math.round(storedMaxRaw) : null
    const floorNew = 'floor_price' in patch && patch.floor_price !== storedFloorRounded ? (patch.floor_price as number) : null
    const maxNew = 'max_price' in patch && patch.max_price !== storedMaxRounded ? (patch.max_price as number | null) : null
    const base = { floorPrice: effectiveFloor, maxPrice: 'max_price' in patch ? (patch.max_price as number | null) : (storedMaxRaw ?? null), ownPrice, factor: FLOOR_FAR_FACTOR }
    if (maxNew !== null && ownPrice > maxNew * FLOOR_FAR_FACTOR) {
      return {
        ok: false,
        code: FLOOR_FAR_ERROR_CODE,
        error: `Максимальная цена ${maxNew} ₸ меньше текущей цены товара ${ownPrice} ₸ более чем в ${FLOOR_FAR_FACTOR} раза. Проверьте, нет ли опечатки.`,
        details: { field: 'max_price', ...base },
      }
    }
    if (floorNew !== null && floorNew > ownPrice) {
      return {
        ok: false,
        code: FLOOR_FAR_ERROR_CODE,
        error: floorNew > ownPrice * FLOOR_FAR_FACTOR
          ? `Минимальная цена ${floorNew} ₸ больше текущей цены товара ${ownPrice} ₸ более чем в ${FLOOR_FAR_FACTOR} раза. Проверьте, нет ли опечатки.`
          : `Минимальная цена ${floorNew} ₸ выше текущей цены товара ${ownPrice} ₸: бот поднимет цену до минимума. Проверьте, нет ли опечатки.`,
        details: { field: 'floor_price', direction: 'above', ...base },
      }
    }
    if (floorNew !== null && floorNew < ownPrice * FLOOR_LOW_SHARE) {
      return {
        ok: false,
        code: FLOOR_FAR_ERROR_CODE,
        error: `Минимальная цена ${floorNew} ₸ меньше половины текущей цены товара ${ownPrice} ₸: бот сможет опустить цену до неё. Проверьте, нет ли опечатки.`,
        details: { field: 'floor_price', direction: 'below', ...base },
      }
    }
  }

  // Включить бота на товаре без нормального пола нельзя: пол -- единственная
  // защита цены от обвала.
  if (patch.enabled === true && effectiveFloor === null) {
    return { ok: false, error: 'Сначала задайте минимальную цену (floor_price больше нуля)' }
  }

  return { ok: true, patch }
}

export type CreateValidation =
  | { ok: true; value: { ownCurrentPrice: number; floorPrice: number; undercutStep: number; checkFrequencyMinutes: number; stockCount: number } }
  | { ok: false; error: string }

// POST /api/kaspi-shop/products: обязательные денежные поля уже проверены на
// наличие вызывающим, здесь -- на смысл.
export function validateProductCreate(body: Record<string, any>): CreateValidation {
  const own = toFiniteNumber(body.ownCurrentPrice)
  if (own === null || own <= 0) return { ok: false, error: 'ownCurrentPrice должен быть числом больше нуля' }
  const floor = checkFloorPrice(body.floorPrice, 'floorPrice')
  if (!floor.ok) return floor
  const step = checkUndercutStep(body.undercutStep, 'undercutStep')
  if (!step.ok) return step
  const freq = body.checkFrequencyMinutes == null ? { ok: true as const, value: DEFAULT_CHECK_FREQUENCY } : checkFrequency(body.checkFrequencyMinutes, 'checkFrequencyMinutes')
  if (!freq.ok) return freq
  const stock = body.stockCount == null ? { ok: true as const, value: 0 } : checkStockCount(body.stockCount, 'stockCount')
  if (!stock.ok) return stock
  return { ok: true, value: { ownCurrentPrice: Math.round(own), floorPrice: floor.value, undercutStep: step.value, checkFrequencyMinutes: freq.value, stockCount: stock.value } }
}

export type BulkValidation =
  | { ok: true; value: { floorPrice: number; maxPrice: number | null; undercutStep: number; dempingStrategy: DempingStrategyValue; checkFrequencyMinutes: number } }
  | { ok: false; error: string }

export function validateBulkSettings(body: Record<string, any>): BulkValidation {
  const floor = checkFloorPrice(body.floorPrice, 'floorPrice')
  if (!floor.ok) return floor
  const max = checkMaxPrice(body.maxPrice, floor.value, 'max_price')
  if (!max.ok) return max
  const step = checkUndercutStep(body.undercutStep, 'undercutStep')
  if (!step.ok) return step
  let strategy: DempingStrategyValue = 'undercut_leader'
  if (body.dempingStrategy !== undefined && body.dempingStrategy !== null && body.dempingStrategy !== '') {
    if (!isDempingStrategy(body.dempingStrategy)) {
      return { ok: false, error: `dempingStrategy должен быть одним из: ${DEMPING_STRATEGIES.join(', ')}` }
    }
    strategy = body.dempingStrategy
  }
  const freq = body.checkFrequencyMinutes == null ? { ok: true as const, value: DEFAULT_CHECK_FREQUENCY } : checkFrequency(body.checkFrequencyMinutes, 'checkFrequencyMinutes')
  if (!freq.ok) return freq
  return { ok: true, value: { floorPrice: floor.value, maxPrice: max.value, undercutStep: step.value, dempingStrategy: strategy, checkFrequencyMinutes: freq.value } }
}

export type BulkSkipReason = 'floor_above_price' | 'max_below_price' | 'no_price'
export type BulkSkipped = { id: string; name: string | null; ownPrice: number | null; reason: BulkSkipReason }

// Одна общая цена-пол на товары с разными ценами (K18): строки, где пол выше
// текущей цены (бот на следующем цикле ПОДНЯЛ бы цену до пола) или максимум ниже
// текущей цены, не включаем и возвращаем списком -- продавец увидит какие и почему.
export function partitionBulkRows<T extends { id: string; product_name?: string | null; own_current_price?: unknown }>(
  rows: T[],
  floor: number,
  max: number | null,
): { eligible: T[]; skipped: BulkSkipped[] } {
  const eligible: T[] = []
  const skipped: BulkSkipped[] = []
  for (const row of rows) {
    const own = toFiniteNumber(row.own_current_price)
    const base = { id: row.id, name: row.product_name ?? null, ownPrice: own }
    if (own === null || own <= 0) skipped.push({ ...base, reason: 'no_price' })
    else if (floor > own) skipped.push({ ...base, reason: 'floor_above_price' })
    else if (max !== null && max < own) skipped.push({ ...base, reason: 'max_below_price' })
    else eligible.push(row)
  }
  return { eligible, skipped }
}
