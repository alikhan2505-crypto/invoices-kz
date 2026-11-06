// Чистая логика страницы «Демпинг» (src/app/kaspi-shop/page.tsx): разбор и проверка
// форм, оценка реального расхода кошелька, тексты подтверждений. Вынесена из
// компонента, чтобы её можно было проверить тестами без браузера.
import { parseMoneyInput, moneyParseMessage } from './moneyInput'

// Цена одной проверки цены товара. Дублирует KASPI_SHOP_CREDIT_PRICE_TENGE из
// wallet.ts: тот файл тянет серверный клиент Supabase и в клиентский бандл не
// годится. Изменили там - поменяйте здесь (тест сверяет оба числа).
export const CHECK_PRICE_TENGE = 5
// GitHub Actions запускает проверку раз в 10 минут (.github/workflows/kaspi-shop-price-check.yml).
export const CRON_INTERVAL_MINUTES = 10
export const DEFAULT_CHECK_FREQUENCY_MINUTES = 15

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10
  const mod100 = Math.abs(n) % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function pluralProducts(n: number): string {
  return pluralRu(n, 'товар', 'товара', 'товаров')
}

export function formatTenge(n: number): string {
  return `${Math.round(n).toLocaleString('ru-KZ')} ₸`
}

// ---------- Расход на проверки ----------

// Настоящий период между проверками: товар «созревает» через check_frequency_minutes,
// но запуски идут только раз в 10 минут, и last_checked_at пишется в конце цикла.
// Поэтому 15 минут на деле означают около 20 (при долгом запуске бывает и 30).
export function effectiveCheckPeriodMinutes(frequencyMinutes: number | null | undefined): number {
  const f = Number(frequencyMinutes)
  const freq = Number.isFinite(f) && f > 0 ? f : DEFAULT_CHECK_FREQUENCY_MINUTES
  return Math.max(CRON_INTERVAL_MINUTES, Math.ceil(freq / CRON_INTERVAL_MINUTES) * CRON_INTERVAL_MINUTES)
}

export function checksPerDay(frequencyMinutes: number | null | undefined): number {
  return Math.round(1440 / effectiveCheckPeriodMinutes(frequencyMinutes))
}

export function dailyCostPerProduct(frequencyMinutes: number | null | undefined): number {
  return checksPerDay(frequencyMinutes) * CHECK_PRICE_TENGE
}

export type CostProduct = { enabled?: boolean; check_frequency_minutes?: number | null }

export type DailyCostEstimate = {
  count: number
  dailyCost: number
  // реальный период: один и тот же у всех или диапазон
  minPeriod: number
  maxPeriod: number
}

// Оценка суточного расхода на включённые товары. Это именно оценка: если у
// продавца пусто на балансе или сессия Kaspi истекла, цикл ведёт себя иначе.
export function estimateDailyCost(products: CostProduct[]): DailyCostEstimate {
  let dailyCost = 0
  let count = 0
  let minPeriod = Infinity
  let maxPeriod = 0
  for (const p of products) {
    if (!p.enabled) continue
    count++
    dailyCost += dailyCostPerProduct(p.check_frequency_minutes)
    const period = effectiveCheckPeriodMinutes(p.check_frequency_minutes)
    minPeriod = Math.min(minPeriod, period)
    maxPeriod = Math.max(maxPeriod, period)
  }
  if (count === 0) return { count: 0, dailyCost: 0, minPeriod: 0, maxPeriod: 0 }
  return { count, dailyCost, minPeriod, maxPeriod }
}

export function periodLabel(minPeriod: number, maxPeriod: number): string {
  return minPeriod === maxPeriod ? `около ${minPeriod} мин` : `от ${minPeriod} до ${maxPeriod} мин`
}

// На сколько часов хватит баланса при данном суточном расходе. null - расхода нет.
export function runwayHours(balance: number, dailyCost: number): number | null {
  if (!(dailyCost > 0)) return null
  return Math.max(0, balance) / (dailyCost / 24)
}

export function runwayLabel(hours: number): string {
  if (hours < 1) return 'меньше часа'
  if (hours < 48) return `около ${Math.floor(hours)} ч`
  return `около ${Math.floor(hours / 24)} дн.`
}

export type LowBalance =
  | { level: 'empty'; message: string }
  | { level: 'low'; message: string }
  | null

// Плашка «баланс заканчивается». Показываем только когда бот действительно что-то
// списывает: есть включённые товары и демпинг не на паузе. Порог «низкий» - меньше
// суток работы.
export function lowBalanceWarning(balance: number, estimate: DailyCostEstimate, paused: boolean): LowBalance {
  if (paused || estimate.count === 0) return null
  if (balance < CHECK_PRICE_TENGE) {
    return {
      level: 'empty',
      message: `Баланс закончился (${formatTenge(balance)}): проверки цен остановлены, цены не обновляются. Пополните баланс, чтобы бот продолжил работу.`,
    }
  }
  const hours = runwayHours(balance, estimate.dailyCost)
  if (hours !== null && hours < 24) {
    return {
      level: 'low',
      message: `Баланса хватит ${runwayLabel(hours)}: на ${estimate.count} ${pluralProducts(estimate.count)} уходит около ${formatTenge(estimate.dailyCost)} в сутки. Когда баланс закончится, бот остановится без предупреждения.`,
    }
  }
  return null
}

// ---------- «Применить сейчас» ----------

export function applyNowConfirmText(count: number, balance: number): string {
  const cost = count * CHECK_PRICE_TENGE
  let text = `Проверить цены сейчас?\n\n${count} ${pluralProducts(count)} × ${CHECK_PRICE_TENGE} ₸ = ${formatTenge(cost)} спишется с баланса.\nПроверка идёт по очереди, у большого списка это занимает несколько минут.`
  if (balance < cost) {
    const can = Math.floor(Math.max(0, balance) / CHECK_PRICE_TENGE)
    text += `\n\nНа балансе ${formatTenge(balance)}: хватит примерно на ${can} ${pluralProducts(can)}, остальные не проверятся.`
  }
  return text
}

// Ответ apply-now. Сервер присылает { count, cost } (старый ответ: { queued }).
// Любое отсутствующее поле считаем неизвестным и в тексте не выдумываем.
export function parseApplyNowResponse(data: any): { count: number | null; cost: number | null } {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  const count = num(data?.count) ?? num(data?.queued)
  const cost = num(data?.cost) ?? (count !== null ? count * CHECK_PRICE_TENGE : null)
  return { count, cost }
}

export function applyNowSuccessText(data: any): string {
  const { count, cost } = parseApplyNowResponse(data)
  const head = count !== null
    ? `Проверка запущена: ${count} ${pluralProducts(count)}${cost !== null ? ` × ${CHECK_PRICE_TENGE} ₸ = ${formatTenge(cost)}` : ''}.`
    : 'Проверка запущена.'
  return `${head} Цены обновятся не сразу: Kaspi опрашивается по очереди, это занимает несколько минут. Страница обновится сама.`
}

// ---------- Ответы сервера ----------

// Текст ошибки для человека: слово сервера, если оно есть, иначе по коду ответа.
export function apiErrorMessage(status: number, data: any, fallback: string): string {
  const fromServer = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : ''
  if (fromServer) return fromServer
  if (status === 401) return 'Вход устарел. Обновите страницу и войдите заново.'
  if (status === 403) return 'Нет доступа к этому действию.'
  if (status >= 500) return 'Сервер временно не отвечает. Попробуйте ещё раз через минуту.'
  return fallback
}

// ---------- Форма настроек товара ----------

export type ProductSettingsInput = { floorPrice: string; maxPrice: string; undercutStep: string }
export type ProductSettingsResult =
  | { ok: true; floor: number; max: number | null; step: number }
  | { ok: false; error: string }

// Проверка до отправки: пустой пол больше не уходит как 0, запятая и пробелы
// понимаются, максимум обязан быть выше минимума. Сервер проверяет то же самое
// ещё раз, это лишь быстрый и понятный отказ.
export function validateProductSettings(v: ProductSettingsInput): ProductSettingsResult {
  const floor = parseMoneyInput(v.floorPrice)
  if (!floor.ok) return { ok: false, error: moneyParseMessage('Минимальная цена', floor) }
  if (floor.value <= 0) return { ok: false, error: 'Минимальная цена должна быть больше нуля.' }

  let max: number | null = null
  const maxParsed = parseMoneyInput(v.maxPrice)
  if (maxParsed.ok) {
    max = maxParsed.value
    if (max <= floor.value) return { ok: false, error: 'Максимальная цена должна быть больше минимальной.' }
  } else if (!maxParsed.blank) {
    return { ok: false, error: moneyParseMessage('Максимальная цена', maxParsed) }
  }

  const step = parseMoneyInput(v.undercutStep)
  if (!step.ok) return { ok: false, error: moneyParseMessage('Шаг', step) }

  return { ok: true, floor: floor.value, max, step: step.value }
}

export type BulkSettingsInput = ProductSettingsInput & { frequency: string }
export type BulkSettingsResult =
  | { ok: true; floor: number; max: number | null; step: number; frequency: number }
  | { ok: false; error: string }

export const MIN_CHECK_FREQUENCY_MINUTES = 5

export function validateBulkSettings(v: BulkSettingsInput): BulkSettingsResult {
  const base = validateProductSettings(v)
  if (!base.ok) return base
  const freq = parseMoneyInput(v.frequency)
  if (!freq.ok) return { ok: false, error: moneyParseMessage('Частота проверки', freq) }
  if (!Number.isInteger(freq.value) || freq.value < MIN_CHECK_FREQUENCY_MINUTES) {
    return { ok: false, error: `Частота проверки: целое число минут, не меньше ${MIN_CHECK_FREQUENCY_MINUTES}.` }
  }
  return { ok: true, floor: base.floor, max: base.max, step: base.step, frequency: freq.value }
}

// ---------- ИИ-подбор цены ----------

export type SuggestGateInput = { cogs_amount?: number | null; last_competitor_price?: number | null }

// Кнопка «ИИ-подбор цены» активна только когда у модели есть что считать:
// себестоимость и хотя бы одна цена конкурента. null - можно нажимать.
export function suggestionBlockReason(p: SuggestGateInput, hasCityCompetitor = false): string | null {
  const hasCost = typeof p.cogs_amount === 'number' && p.cogs_amount > 0
  const hasCompetitor = (typeof p.last_competitor_price === 'number' && p.last_competitor_price > 0) || hasCityCompetitor
  if (!hasCost && !hasCompetitor) return 'Нужны себестоимость (раздел «Прибыль») и цена конкурента (появится после первой проверки цен).'
  if (!hasCost) return 'Укажите себестоимость товара в разделе «Прибыль»: без неё подбор не может проверить, что цена не ниже затрат.'
  if (!hasCompetitor) return 'Пока нет цен конкурентов: дождитесь первой проверки цен по этому товару.'
  return null
}
