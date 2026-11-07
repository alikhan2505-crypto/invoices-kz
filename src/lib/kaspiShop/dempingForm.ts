// Чистая логика страницы «Демпинг» (src/app/kaspi-shop/page.tsx): разбор и проверка
// форм, оценка реального расхода кошелька, тексты подтверждений. Вынесена из
// компонента, чтобы её можно было проверить тестами без браузера.
import { parseMoneyInput, moneyParseMessage } from './moneyInput'

// Цена одного ИЗМЕНЕНИЯ цены ботом (правило основателя от 07.11.2026): проверки
// бесплатны, 5 ₸ списывается только когда бот реально сменил цену и она дошла до
// Kaspi. Дублирует KASPI_SHOP_CREDIT_PRICE_TENGE из wallet.ts: тот файл тянет
// серверный клиент Supabase и в клиентский бандл не годится. Изменили там -
// поменяйте здесь (тест сверяет оба числа).
export const PRICE_CHANGE_TENGE = 5
// GitHub Actions запускает проверку раз в 10 минут (.github/workflows/kaspi-shop-price-check.yml).
export const CRON_INTERVAL_MINUTES = 10
// Новые товары проверяются раз в час. Уже заведённые строки не переносились:
// у них остаётся своя частота.
export const DEFAULT_CHECK_FREQUENCY_MINUTES = 60

// Одна фраза про модель списаний: везде, где страница говорит о цене бота.
export const PRICE_MODEL_NOTE = `Проверки бесплатны, ${PRICE_CHANGE_TENGE} ₸ списывается только за каждое изменение цены ботом.`

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

// ---------- Расписание проверок ----------

// Запуски идут раз в 10 минут, а last_checked_at пишется В СЕРЕДИНЕ запуска (после
// тика, не на нём): к следующему тику с записи прошло чуть меньше целого числа
// десяток. Поэтому частота округляется ВВЕРХ до целого числа тиков (60 = 6 тиков,
// 15 = 2 тика), а порог «пора проверять» стоит на CHECK_DUE_SLACK_MINUTES раньше
// границы тика: товар, записанный в любую минуту первых 9 после тика, созревает
// ровно на нужном тике, а не на следующем (раньше «60» на деле означало 70).
export const CHECK_DUE_SLACK_MINUTES = CRON_INTERVAL_MINUTES - 1

// Настоящий период между проверками. Он выдержан при записи в первые 9 минут после
// тика; при очень долгом запуске или опоздавшем расписании GitHub бывает на тик
// дольше, поэтому в подписях «примерно».
export function effectiveCheckPeriodMinutes(frequencyMinutes: number | null | undefined): number {
  const f = Number(frequencyMinutes)
  const freq = Number.isFinite(f) && f > 0 ? f : DEFAULT_CHECK_FREQUENCY_MINUTES
  return Math.max(CRON_INTERVAL_MINUTES, Math.ceil(freq / CRON_INTERVAL_MINUTES) * CRON_INTERVAL_MINUTES)
}

// Сколько минут должно пройти с last_checked_at, чтобы товар считался «пора проверять»
// (его использует isCheckDue в checkCycle.ts, чтобы страница и бегунок считали одинаково).
export function checkDueAfterMinutes(frequencyMinutes: number | null | undefined): number {
  return effectiveCheckPeriodMinutes(frequencyMinutes) - CHECK_DUE_SLACK_MINUTES
}

export type ScheduleProduct = { enabled?: boolean; available_for_sale?: boolean | null; check_frequency_minutes?: number | null }

// Бот проверяет только включённые товары, которые в продаже: снятые с продажи на
// Kaspi (available_for_sale = false) цикл и «Применить сейчас» пропускают. Пустое
// значение у старых строк считается «в продаже». Так же считается карточка «Активных».
export function isActiveProduct(p: ScheduleProduct): boolean {
  return !!p.enabled && p.available_for_sale !== false
}

export type ScheduleSummary = {
  count: number
  // реальный период: один и тот же у всех или диапазон
  minPeriod: number
  maxPeriod: number
}

// Сколько товаров бот реально проверяет и как часто. Денег здесь больше нет:
// проверка бесплатна, а число изменений цены заранее не известно (его решают
// конкуренты), поэтому честной суммы «в сутки» не показываем.
export function summarizeSchedule(products: ScheduleProduct[]): ScheduleSummary {
  let count = 0
  let minPeriod = Infinity
  let maxPeriod = 0
  for (const p of products) {
    if (!isActiveProduct(p)) continue
    count++
    const period = effectiveCheckPeriodMinutes(p.check_frequency_minutes)
    minPeriod = Math.min(minPeriod, period)
    maxPeriod = Math.max(maxPeriod, period)
  }
  if (count === 0) return { count: 0, minPeriod: 0, maxPeriod: 0 }
  return { count, minPeriod, maxPeriod }
}

// «Примерно»: период - расчётный, а не обещание до минуты (см. effectiveCheckPeriodMinutes).
export function periodLabel(minPeriod: number, maxPeriod: number): string {
  return minPeriod === maxPeriod
    ? `примерно раз в ${minPeriod} мин`
    : `примерно раз в ${minPeriod}-${maxPeriod} мин, в зависимости от товара`
}

export type LowBalance = { title: string; message: string } | null

// Плашка «баланс меньше цены изменения». Показываем только когда бот действительно
// работает: есть включённые товары в продаже и демпинг не на паузе. Ниже 5 ₸ бот
// цены не меняет (не может оплатить изменение), проверки при этом тоже не идут.
export function lowBalanceWarning(balance: number, summary: ScheduleSummary, paused: boolean): LowBalance {
  if (paused || summary.count === 0) return null
  if (balance >= PRICE_CHANGE_TENGE) return null
  return {
    title: `Баланс меньше ${PRICE_CHANGE_TENGE} ₸: бот не сможет менять цены`,
    message: `Сейчас на балансе ${formatTenge(balance)}. ${PRICE_MODEL_NOTE} Пока денег нет, бот цены не меняет. Пополните баланс, и он продолжит работу.`,
  }
}

// ---------- «Применить сейчас» ----------

export type ApplyNowGate = { paused: boolean; sessionStatus: string | null | undefined; activeCount: number; balance: number }

// Почему «Применить сейчас» сейчас недоступна (null - можно нажимать). Те же причины
// сервер называет в ответе apply-now; страница говорит о них заранее, а не после нажатия.
export function applyNowBlockReason(g: ApplyNowGate): string | null {
  if (g.paused) return 'Демпинг на паузе: включите его, чтобы запустить проверку.'
  if (g.sessionStatus === 'session_expired') return 'Сессия Kaspi истекла: переподключите магазин, и проверка снова станет доступна.'
  if (g.activeCount === 0) return 'Нет включённых товаров в продаже: проверять нечего.'
  if (g.balance < PRICE_CHANGE_TENGE) return `Баланс меньше ${PRICE_CHANGE_TENGE} ₸: бот не сможет менять цены. Пополните баланс.`
  return null
}

// Ответ apply-now: { count, queued }. Любое отсутствующее поле считаем неизвестным
// и в тексте не выдумываем. Стоимости в ответе больше нет: проверка бесплатна.
export function parseApplyNowResponse(data: any): { count: number | null } {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  return { count: num(data?.count) ?? num(data?.queued) }
}

export function applyNowSuccessText(data: any): string {
  const { count } = parseApplyNowResponse(data)
  const head = count !== null ? `Проверка запущена: ${count} ${pluralProducts(count)}.` : 'Проверка запущена.'
  return `${head} Цены обновятся не сразу: Kaspi опрашивается по очереди, это занимает несколько минут. ${PRICE_MODEL_NOTE} Страница обновится сама.`
}

// ---------- Ответы сервера ----------

// PATCH /api/kaspi-shop/products отвечает 400 с этим кодом, когда минимум сильно
// выше текущей цены (или максимум сильно ниже): почти всегда опечатка. Форма
// спрашивает продавца и повторяет запрос с confirmFloor: true.
export const FLOOR_FAR_ERROR_CODE = 'floor_far_above_price'

export function isFloorFarResponse(status: number, data: any): boolean {
  return status === 400 && data?.code === FLOOR_FAR_ERROR_CODE
}

// Текст подтверждения. Числа берём из ответа сервера; если их нет (или они
// не числа), возвращаем null: тогда показываем обычную ошибку сервера, а не
// выдуманные цифры.
export function floorFarConfirmText(data: any): string | null {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  const own = num(data?.ownPrice)
  if (own === null) return null
  const factor = num(data?.factor) ?? 3
  if (data?.field === 'max_price') {
    const max = num(data?.maxPrice)
    if (max === null) return null
    return `Максимум ${formatTenge(max)} ниже текущей цены ${formatTenge(own)} более чем в ${factor} ${pluralRu(factor, 'раз', 'раза', 'раз')}. Бот сделает это при следующей проверке, если товар включён: цена опустится до максимума, за это изменение спишется ${PRICE_CHANGE_TENGE} ₸. Сохранить?`
  }
  const floor = num(data?.floorPrice)
  if (floor === null) return null
  return `Минимум ${formatTenge(floor)} выше текущей цены ${formatTenge(own)} более чем в ${factor} ${pluralRu(factor, 'раз', 'раза', 'раз')}. Бот сделает это при следующей проверке, если товар включён: цена поднимется до минимума, за это изменение спишется ${PRICE_CHANGE_TENGE} ₸. Сохранить?`
}

// «Обновить каталог»: при неполном импорте (502 с partial: true) часть товаров уже
// записана, поэтому список на странице надо перечитать, иначе они не видны.
export function catalogSyncShouldReload(ok: boolean, data: any): boolean {
  if (ok) return true
  return typeof data?.imported === 'number' && data.imported > 0
}

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
