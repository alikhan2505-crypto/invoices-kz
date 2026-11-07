// Калькулятор маржи -- pure unit-economics math for evaluating a product
// BEFORE listing it on Kaspi (unlike profit.ts, which reconciles real past
// orders). No network, no React -- called from the UI on every keystroke,
// so it has to stay cheap and side-effect-free. See margin.test.ts.

import { KASPI_DELIVERY, deliveryRowById } from '@/lib/kaspiTariff'

export type MarginInputs = {
  kaspiPrice: number
  commissionRatePercent: number
  sourcingPrice: number
  weightGrams: number
  cargoRatePerKgTenge: number
  packagingCost: number
  deliveryFee: number
}

export type MarginResult = {
  commissionAmount: number
  cargoCost: number
  cogs: number
  profit: number
  marginPercent: number
}

export type Verdict = 'take' | 'skip'

// Cargo shipping (China -> KZ) is billed per kilogram, weight is entered in
// grams (how sellers actually think about a single small item) -- converted
// here so callers never have to remember the /1000.
export function computeMargin(inputs: MarginInputs): MarginResult {
  const commissionAmount = inputs.kaspiPrice * (inputs.commissionRatePercent / 100)
  const cargoCost = (inputs.weightGrams / 1000) * inputs.cargoRatePerKgTenge
  const cogs = inputs.sourcingPrice + cargoCost + inputs.packagingCost
  const profit = inputs.kaspiPrice - commissionAmount - inputs.deliveryFee - cogs
  // Margin as a percentage of the SALE price (not of cost -- that would be
  // markup, a different and commonly-confused number). Matches how
  // Northline's own tool and most KZ resellers say "маржа X%".
  const marginPercent = inputs.kaspiPrice > 0 ? (profit / inputs.kaspiPrice) * 100 : 0
  return { commissionAmount, cargoCost, cogs, profit, marginPercent }
}

/**
 * The selling price at which this product breaks even, and the price that hits
 * a target margin. Null when commission alone takes the whole price, since no
 * price can then work.
 *
 * Solved rather than hunted for. The page's "what if the price drops by N%"
 * slider lets a seller watch margin erode until it looks bad, which is a way
 * of guessing a number that has an exact answer: commission is a share OF the
 * price, so raising the price raises what is taken off it, and the floor is
 * therefore always above the plain sum of costs.
 *
 *   profit = P - P·r - fixed = 0        =>  P = fixed / (1 - r)
 *   margin = (P - P·r - fixed) / P = m  =>  P = fixed / (1 - r - m)
 *
 * where fixed is everything that does not scale with the price — sourcing,
 * cargo, packaging and the delivery fee.
 *
 * Delivery is a constant (inputs.deliveryFee, a hand-typed number) unless
 * `deliveryTariff` is passed: then it is a step function of the price (Kaspi's
 * grid) and the floor is solved tier by tier, see minProfitablePrice for what
 * "floor" means across a tier boundary.
 */
export function computeBreakEvenPrice(
  inputs: Omit<MarginInputs, 'kaspiPrice'>,
  targetMarginPercent = 0,
  deliveryTariff?: DeliveryTariff,
): { breakEven: number | null; atTargetMargin: number | null } {
  const rate = Math.max(0, Math.min(inputs.commissionRatePercent, 100)) / 100
  const target = Math.max(0, Math.min(targetMarginPercent, 100)) / 100
  const cargoCost = (Math.max(0, inputs.weightGrams) / 1000) * Math.max(0, inputs.cargoRatePerKgTenge)
  const fixed = Math.max(0, inputs.sourcingPrice) + cargoCost + Math.max(0, inputs.packagingCost)
  const delivery = deliveryTariff ?? Math.max(0, inputs.deliveryFee)

  return {
    breakEven: minProfitablePrice({ share: rate, fixed, delivery }),
    atTargetMargin: minProfitablePrice({ share: rate + target, fixed, delivery }),
  }
}

export function computeVerdict(marginPercent: number, targetMarginPercent: number): Verdict {
  return marginPercent >= targetMarginPercent ? 'take' : 'skip'
}

// Default cargo rate, ₸/кг -- a rough current (2026-08) market rate for
// China -> KZ cargo delivery quoted by KZ resellers, NOT fetched from any
// live source. Purely a sane starting point the seller is expected to
// override with whatever their own cargo company actually charges.
export const DEFAULT_CARGO_RATE_PER_KG = 1500

// Default target-margin threshold the Брать/Не брать verdict is judged
// against, until the seller sets their own (see profiles.kaspi_margin_target_percent).
export const DEFAULT_TARGET_MARGIN_PERCENT = 20

// ---------------------------------------------------------------------------
// Kaspi Доставка: официальная сетка тарифов с 01.01.2026 (страница Kaspi
// https://guide.kaspi.kz/partner/ru/shop/delivery/shipping/q2288, Express:
// https://guide.kaspi.kz/partner/ru/shop/delivery/express/q2953; проверено
// 17.10.2026 и 23.10.2026). Сами цифры живут ОДИН раз, в KASPI_DELIVERY
// (src/lib/kaspiTariff.ts: по ним же построен гайд tarify-dostavki-kaspi-magazin);
// здесь только правило выбора строки по сумме заказа и весу.
//
//  - Заказ до 10 000 ₸: тариф по СУММЕ заказа (49 / 149 / 199 / 699-799 ₸),
//    вес не важен. Заказ от 10 000 ₸ (граница входит в этот блок, так и написано
//    в таблице: "10 000 ₸ и более"): тариф по ВЕСУ.
//  - Границы внутри блока Kaspi пишет словами ("до 1 000", "от 1 000 до 3 000"),
//    не говоря, к какой строке относится ровно 1 000. Берём строку СВЕРХУ
//    (1 000 ₸ уже 149 ₸): так расход не занижается. С весом наоборот, потому что
//    последняя строка названа "свыше 100 кг": значит, ровно 5 / 15 / 30 / 60 / 100 кг
//    ещё входят в строку, где это верхняя граница ("до 5 кг", "60-100 кг").
//  - Тарифы Kaspi БЕЗ НДС, списывается доставка с НДС (в той же таблице). Ставка
//    НДС 16% (НК РК 2026) в тарифе не названа, это общая ставка; в kaspi-страницах
//    нет ответа, зачитывается ли этот НДС у плательщиков НДС: не моделируем.
//  - Express: если товары заказа лежат на разных складах, плата берётся за каждую
//    доставку отдельно. Здесь считается ОДНА доставка.
//  - Что с доставкой при отмене и возврате заказа, Kaspi не пишет: не моделируем.
// ---------------------------------------------------------------------------

export type KaspiDeliveryDirection = 'city' | 'kazakhstan' | 'express'

/** Направления в порядке колонок таблицы Kaspi. */
export const KASPI_DELIVERY_DIRECTIONS: readonly KaspiDeliveryDirection[] = ['city', 'kazakhstan', 'express']

/** НДС на доставку Kaspi, %: общая ставка НДС РК с 2026 года (как Z2_VAT_RATE в nakladnayaZ2.ts, сверяется тестом). */
export const KASPI_DELIVERY_VAT_PERCENT = 16

// Верхние границы строк. Для суммы граница НЕ входит в свою строку, для веса входит.
const AMOUNT_TIERS: readonly { id: string; below: number }[] = [
  { id: 'lt1000', below: 1000 },
  { id: '1000-3000', below: 3000 },
  { id: '3000-5000', below: 5000 },
  { id: '5000-10000', below: KASPI_DELIVERY.thresholdTenge },
]
const WEIGHT_TIERS: readonly { id: string; upToKg: number }[] = [
  { id: 'w-to5', upToKg: 5 },
  { id: 'w-5-15', upToKg: 15 },
  { id: 'w-15-30', upToKg: 30 },
  { id: 'w-30-60', upToKg: 60 },
  { id: 'w-60-100', upToKg: 100 },
  { id: 'w-over100', upToKg: Infinity },
]

export type KaspiDeliveryQuote = {
  /** Идентификатор строки таблицы Kaspi (KASPI_DELIVERY.*[].id). */
  tierId: string
  /** По чему выбрана строка: по сумме заказа (до 10 000 ₸) или по весу (от 10 000 ₸). */
  basis: 'amount' | 'weight'
  /** Вес не указан, а нужен (заказ от 10 000 ₸): взята самая лёгкая строка "до 5 кг". */
  weightAssumed: boolean
  /** Тариф Kaspi без НДС, ₸. */
  netTenge: number
  /** НДС на доставку, ₸ (0, если withVat выключен). */
  vatTenge: number
  /** Итого к списанию, ₸ (целое). */
  totalTenge: number
}

/**
 * Доставка Kaspi по официальной сетке. Сумма заказа и вес приходят как есть (с
 * поля ввода): минус, NaN и пустое считаются нулём. Заказ от 10 000 ₸ без веса даёт
 * строку "до 5 кг" и weightAssumed: true: честнее подсказать, чем молча угадать.
 */
export function kaspiDeliveryQuote(args: {
  orderAmount: number
  weightKg?: number
  direction: KaspiDeliveryDirection
  withVat: boolean
}): KaspiDeliveryQuote {
  const amount = Number.isFinite(args.orderAmount) && args.orderAmount > 0 ? args.orderAmount : 0
  const kg = typeof args.weightKg === 'number' && Number.isFinite(args.weightKg) && args.weightKg > 0 ? args.weightKg : 0

  let tierId: string
  let basis: 'amount' | 'weight'
  if (amount < KASPI_DELIVERY.thresholdTenge) {
    basis = 'amount'
    tierId = (AMOUNT_TIERS.find(t => amount < t.below) ?? AMOUNT_TIERS[AMOUNT_TIERS.length - 1]).id
  } else {
    basis = 'weight'
    tierId = (WEIGHT_TIERS.find(t => kg <= t.upToKg) ?? WEIGHT_TIERS[WEIGHT_TIERS.length - 1]).id
  }

  const netTenge = deliveryRowById(tierId)[args.direction]
  const totalTenge = args.withVat ? Math.round((netTenge * (100 + KASPI_DELIVERY_VAT_PERCENT)) / 100) : netTenge
  return {
    tierId,
    basis,
    weightAssumed: basis === 'weight' && kg === 0,
    netTenge,
    vatTenge: totalTenge - netTenge,
    totalTenge,
  }
}

/** Стоимость доставки Kaspi для одного заказа, ₸ (целое); с НДС, если withVat. */
export function kaspiDeliveryFee(args: {
  orderAmount: number
  weightKg?: number
  direction: KaspiDeliveryDirection
  withVat: boolean
}): number {
  return kaspiDeliveryQuote(args).totalTenge
}

// ---------------------------------------------------------------------------
// Безубыточная цена при тарифе, который зависит от цены.
//
// Пока доставка была числом, цена выхода в ноль решалась одной формулой
// P = fixed / (1 - доля). Теперь до 10 000 ₸ тариф Kaspi растёт СКАЧКАМИ вместе с
// ценой (при цене 4 999 ₸ доставка 231 ₸ с НДС, при 5 000 ₸ уже 811 ₸), и от 10 000 ₸
// ещё раз (1 275 ₸ при весе до 5 кг). Значит, в числителе стоит не константа, а
// ступенчатая функция цены, и одна формула даёт ложный порог: на 555 ₸ выше
// настоящего в одном случае и убыточный в другом.
//
// Прибыль profit(P) = P*(1 - доля) - fixed - доставка(P) внутри одной ступени тарифа
// растёт с ценой, а на границе ступени ПАДАЕТ скачком (доставка дорожает). Поэтому
// множество цен с profit >= 0 может быть не одним лучом, а несколькими кусками:
// карман прибыли прямо под границей ступени, потом провал, потом снова прибыль.
//
// Какую цену называем «минимальной». НАИМЕНЬШУЮ ЦЕНУ, НАЧИНАЯ С КОТОРОЙ ЛЮБАЯ ЦЕНА
// ВЫШЕ НЕЁ НЕ УБЫТОЧНА (profit(P) >= 0 для всех P >= результата). Почему не просто
// первую точку, где прибыль ноль: от неё есть цена выше, на которой продавец снова
// в минусе, а это ровно тот пол, который нужен репрайсеру («бот не опустит ниже X»):
// бот ходит по ценам вниз и не должен остановиться в провале. Цена продажи с
// карманом прибыли ниже результата возможна (например, 4 999 ₸ в плюс, а 5 000 ₸ в
// минус, порог 5 282 ₸), это осознанно: пол остаётся безопасным, а не самым низким.
//
// Решение точное, перебором ступеней сверху вниз: для ступени [lo, hi) с доставкой d
// корень s = (fixed + d) / (1 - доля). Если s <= lo, вся ступень не убыточна, идём
// на ступень ниже; если lo < s < hi, ответ s; если s >= hi, вся ступень убыточна и
// ответ hi (первая цена ступени выше). Результат вещественный (корень), как и
// раньше; показывать его целым тенге нужно через ceilPrice, иначе округление вниз
// даёт цену с убытком в доли тенге.
// ---------------------------------------------------------------------------

/** Доставка как функция цены продажи: ступени тарифа Kaspi по сумме заказа. */
export type DeliveryTariff = {
  /** Доставка с этой ценой продажи, ₸ (ступенчатая, не убывает с ценой). */
  feeAt: (price: number) => number
  /** Цены, с которых тариф меняется скачком (включительно), по возрастанию. */
  breakpoints: readonly number[]
}

/** Границы ступеней тарифа по сумме заказа: 1 000, 3 000, 5 000 и порог по весу 10 000 ₸. */
export const KASPI_DELIVERY_PRICE_BREAKPOINTS: readonly number[] = AMOUNT_TIERS.map(t => t.below)

/**
 * Тариф Kaspi как функция цены для безубыточной цены. Вес нужен только от 10 000 ₸
 * (без веса строка «до 5 кг», как в kaspiDeliveryQuote).
 */
export function kaspiDeliveryTariff(args: {
  weightKg?: number
  direction: KaspiDeliveryDirection
  withVat: boolean
}): DeliveryTariff {
  return {
    feeAt: price => kaspiDeliveryFee({ orderAmount: price, ...args }),
    breakpoints: KASPI_DELIVERY_PRICE_BREAKPOINTS,
  }
}

/**
 * Тариф для кабинета: направление «город», с НДС, вес товара в граммах (0 = не указан).
 * Один и тот же для автозаполнения доставки, ползунка «что если цена упадёт» и порога.
 */
export function cityDeliveryTariff(weightGrams: number): DeliveryTariff {
  const g = Number.isFinite(weightGrams) && weightGrams > 0 ? weightGrams : 0
  return kaspiDeliveryTariff({ weightKg: g / 1000, direction: 'city', withVat: true })
}

/**
 * Доставка для поля кабинета, пока его не правили руками: по цене Kaspi и весу товара
 * в граммах (0 = не указан, тогда от 10 000 ₸ строка «до 5 кг»). Null, если цены нет:
 * считать нечего.
 */
export function autoDeliveryFee(price: number, weightGrams: number): number | null {
  if (!Number.isFinite(price) || price <= 0) return null
  return cityDeliveryTariff(weightGrams).feeAt(price)
}

/**
 * Входные данные для цены ползунка «что если цена упадёт»: тот же товар по другой
 * цене. Пока доставку не правили руками, она пересчитывается для цены ползунка
 * (тариф скачет на границах 1 000 / 3 000 / 5 000 / 10 000 ₸), иначе остаётся числом
 * из поля.
 */
export function inputsAtPrice(base: MarginInputs, price: number, deliveryTouched: boolean): MarginInputs {
  const auto = deliveryTouched ? null : autoDeliveryFee(price, base.weightGrams)
  return { ...base, kaspiPrice: price, deliveryFee: auto ?? base.deliveryFee }
}

/** От 10 000 ₸ Kaspi считает доставку по весу; если веса нет, берётся «до 5 кг» и это надо сказать. */
export function deliveryWeightAssumed(price: number, weightGrams: number): boolean {
  return Number.isFinite(price) && price >= KASPI_DELIVERY.thresholdTenge && !(Number.isFinite(weightGrams) && weightGrams > 0)
}

/**
 * Наименьшая цена, начиная с которой любая цена не убыточна (см. блок выше).
 * share: доля цены, которую забирают комиссия, налог и, если нужна целевая маржа, она
 * сама (0..1); fixed: расходы, не зависящие от цены, без доставки; delivery: число
 * (постоянная доставка) или тариф-функция цены. Null, если share >= 1: при такой
 * доле безубыточной цены не существует.
 */
export function minProfitablePrice(args: { share: number; fixed: number; delivery: number | DeliveryTariff }): number | null {
  const share = Number.isFinite(args.share) ? Math.max(0, args.share) : 0
  if (share >= 1) return null
  const kept = 1 - share
  const fixed = Number.isFinite(args.fixed) && args.fixed > 0 ? args.fixed : 0

  if (typeof args.delivery === 'number') {
    const d = Number.isFinite(args.delivery) && args.delivery > 0 ? args.delivery : 0
    return (fixed + d) / kept
  }
  const { feeAt, breakpoints } = args.delivery
  const starts = [0, ...[...breakpoints].filter(b => b > 0).sort((a, b) => a - b)]

  let answer = 0
  for (let i = starts.length - 1; i >= 0; i--) {
    const lo = starts[i]
    const hi = i + 1 < starts.length ? starts[i + 1] : Infinity
    const d = Math.max(0, feeAt(lo))
    const s = (fixed + d) / kept
    // допуск на дробную погрешность: корень, лежащий ровно на границе ступени (3000.0000000000005), не должен перепрыгивать к верхней ступени
    if (s <= lo + 1e-9 * Math.max(1, lo)) { answer = lo; continue }
    return s < hi ? s : answer
  }
  return answer
}

/** Цену, ниже которой убыток, в целых тенге вверх (с допуском на дробную погрешность корня): так на показанной цене прибыль не отрицательна. */
export function ceilPrice(price: number): number {
  return Math.max(0, Math.ceil(price - 1e-9))
}

export type CategoryCommission = {
  label: string
  /** Обычная комиссия, % с НДС. */
  ratePercent: number
  /** Комиссия в акциях Магазина, % с НДС (см. KASPI_PROMO_RATE_BY_RATE ниже). */
  promoRatePercent: number
}

// Комиссия в акциях Магазина: отдельная таблица Kaspi "Тарифы акций Магазина на
// Kaspi.kz с 05.01.2026" (страница
// https://guide.kaspi.kz/partner/ru/marketing/documents/Tarify_Akciy_Magazina_na_Kaspi_kz_2026,
// PDF https://guide.kaspi.kz/cdn/content/pay/product/documents/Marketing/Tarify_Akciy_Magazina_na_Kaspi_kz_2026.pdf;
// разобрана целиком 17.10.2026). Те же три уровня, каждый выше обычного:
// 12,5 -> 13,0 (+0,5 п.п.), 7,3 -> 7,7 (+0,4), 15,5 -> 16,1 (+0,6); без НДС 11,3 / 6,8 / 14,0.
// Рассрочка Kaspi Red 0-0-3/6/12, Kaspi Кредит и оплата картой другого банка
// комиссию НЕ меняют: с 05.01.2026 комиссия единая (Kaspi Гид, q3734 и q4099, "Обновлен
// 06.01.2026"). Надбавка за рассрочку 0-0-24 нигде не опубликована ("комиссия может
// измениться", условия видны только в кабинете: Маркетинг -> Акции Магазина), поэтому
// её нет ни в одной таблице, продавец вводит её сам. Применяется ли таблица акций к
// акциям именно с 0-0-24, в ней не сказано: так и пишем в интерфейсе.
export const KASPI_PROMO_RATE_BY_RATE: Readonly<Record<string, number>> = {
  '7.3': 7.7,
  '12.5': 13.0,
  '15.5': 16.1,
}

/** Ставка в акциях для обычной ставки одного из трёх опубликованных уровней; для любой другой null (не выдумываем). */
export function promoRateFor(regularRatePercent: number): number | null {
  return KASPI_PROMO_RATE_BY_RATE[String(regularRatePercent)] ?? null
}

/** Обратное: обычная ставка по ставке акции; null, если это не одна из трёх опубликованных. */
export function regularRateFor(promoRatePercent: number): number | null {
  for (const [regular, promo] of Object.entries(KASPI_PROMO_RATE_BY_RATE)) {
    if (promo === promoRatePercent) return Number(regular)
  }
  return null
}

/** Тип продажи в калькуляторе: обычная, акция Магазина, акция с рассрочкой 0-0-24. */
export type KaspiSaleType = 'regular' | 'promo' | 'promo24'

/**
 * Итоговая комиссия, %: ставка выбранного режима (обычная или акции, её подставляет
 * вызывающий) плюс надбавка за 0-0-24 в процентных пунктах, только в режиме promo24.
 * Надбавка не бывает отрицательной (Kaspi такого не публикует), мусор считаем нулём.
 */
export function effectiveCommissionPercent(
  baseRatePercent: number,
  saleType: KaspiSaleType,
  surchargePp: number,
): number {
  const base = Number.isFinite(baseRatePercent) && baseRatePercent > 0 ? baseRatePercent : 0
  const extra = saleType === 'promo24' && Number.isFinite(surchargePp) && surchargePp > 0 ? surchargePp : 0
  return Math.round((base + extra) * 100) / 100
}

/**
 * Ставка в поле комиссии при переходе между обычной продажей и акцией. Выбрана
 * категория из таблицы: её ставка нужного режима. Категории нет: переводим текущую
 * ставку по трём опубликованным уровням (12,5 <-> 13,0). Своя ставка не из таблицы:
 * null, то есть поле не трогаем, ставку акции для неё мы не знаем и не выдумываем.
 */
export function rateOnSaleTypeSwitch(
  categoryLabel: string,
  currentRatePercent: number,
  toPromo: boolean,
): number | null {
  const found = KASPI_CATEGORY_COMMISSIONS.find(c => c.label === categoryLabel)
  if (found) return toPromo ? found.promoRatePercent : found.ratePercent
  return toPromo ? promoRateFor(currentRatePercent) : regularRateFor(currentRatePercent)
}

function entry(label: string, ratePercent: number): CategoryCommission {
  // Любой ставки вне трёх опубликованных уровней в таблице быть не должно (проверяет тест).
  return { label, ratePercent, promoRatePercent: promoRateFor(ratePercent) ?? NaN }
}

// Real per-category commission rates, transcribed from Kaspi's own published
// partner tariff: "Тарифы Магазина на Kaspi.kz с 5 января 2026 года" (PDF),
// https://guide.kaspi.kz/cdn/content/pay/product/documents/Magazin/Tarify_Magazina_na_Kaspi_kz_2026.pdf
// -- linked from https://guide.kaspi.kz/partner/ru/shop/conditions/q1344
// (page "Комиссии за продажи по всем категориям товаров в Магазине на Kaspi.kz",
// "Обновлен 06.01.2026"). The tariff has been in force since 05.01.2026; the
// table was re-checked against the PDF on 23.10.2026. The source document has
// thousands of rows down to a 5th-level subcategory (e.g. "Автотовары >
// Автозапчасти > Двигатель > Картер двигателя"), each with two published
// percentages -- "Комиссия без НДС" (Kaspi's base fee) and "Комиссия с НДС"
// (the same fee with VAT, shown by Kaspi as a separate published figure; the
// pairs are NOT an exact x1.16 (10,9 -> 12,5 is x1.147, 6,4 -> 7,3 is x1.141,
// 13,5 -> 15,5 is x1.148), so never recompute one from the other).
// We use "с НДС" here because that is the percentage of the sale price a
// seller should plan their cash unit economics around.
//
// This table collapses that down to ONE rate per TOP-LEVEL category
// ("Категория 1-го уровня"), which is enough for every category we verified
// is uniform across all its subcategories (the overwhelming majority --
// e.g. every single row under Автотовары, Одежда, Строительство и ремонт,
// etc. carries the same rate). A handful of top-level categories are
// genuinely split between rates depending on subcategory (medicine vs.
// other pharmacy goods, phone accessories vs. phones themselves, pet food
// and litter vs. other pet goods) -- those are listed as separate entries
// below. The labels are also stored identifiers (commission_category_label in
// kaspi_shop_product_costs, the stats key of the public calculator), so an
// existing label is never reworded: a split is added as a NEW entry instead.
//
// A verified exception that is NOT split out (a single subcategory; the seller
// can type the rate by hand): ТВ, Аудио, Видео > Аудиотехника > Чехлы для
// наушников is 15,5% while the rest of that category is 12,5%.
//
// The top-level category "Аксессуары" is deliberately OMITTED: unlike the
// above, it has no clean majority split -- 17 of its 29
// subcategories are 15.5% and 12 are 12.5% with no simple rule to collapse it
// to one number without guessing. Per this feature's own design brief: an
// honestly incomplete list with a manual-entry fallback is correct; a
// plausible-looking wrong number is not. Sellers in that category should type
// their own rate.
export const KASPI_CATEGORY_COMMISSIONS: CategoryCommission[] = [
  entry('Автотовары', 12.5),
  entry('Аптека — лекарства', 7.3),
  entry('Аптека — прочее (БАД, медтехника, гигиена, оптика)', 12.5),
  entry('Бытовая техника', 12.5),
  entry('Детские товары', 12.5),
  entry('Досуг, книги', 12.5),
  entry('Канцелярские товары', 12.5),
  entry('Компьютеры', 12.5),
  entry('Красота и здоровье', 12.5),
  entry('Мебель', 12.5),
  entry('Обувь', 12.5),
  entry('Одежда', 12.5),
  entry('Подарки, товары для праздников', 12.5),
  entry('Продукты питания', 7.3),
  entry('Спорт, туризм', 12.5),
  entry('Строительство, ремонт', 12.5),
  entry('ТВ, Аудио, Видео', 12.5),
  entry('Телефоны и гаджеты — смартфоны и гаджеты', 12.5),
  entry('Телефоны и гаджеты — аксессуары (чехлы, кабели, стёкла)', 15.5),
  entry('Телефоны и гаджеты — зарядные устройства и внешние аккумуляторы', 12.5),
  entry('Товары для дома и дачи', 12.5),
  entry('Товары для животных — корма и лакомства', 7.3),
  entry('Товары для животных — наполнители туалета и комбикорма', 7.3),
  entry('Товары для животных — прочее (ветаптека, груминг, аксессуары)', 12.5),
  entry('Украшения', 15.5),
]
