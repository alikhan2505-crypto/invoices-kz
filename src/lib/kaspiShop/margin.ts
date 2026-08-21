// Калькулятор маржи -- pure unit-economics math for evaluating a product
// BEFORE listing it on Kaspi (unlike profit.ts, which reconciles real past
// orders). No network, no React -- called from the UI on every keystroke,
// so it has to stay cheap and side-effect-free. See margin.test.ts.

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

// Kaspi has no public API for its own delivery-fee-by-weight/city schedule,
// and this codebase has no existing knowledge of one either (checked
// cabinetApi.ts and pricing.ts -- confirmed nothing, see the design doc this
// module shipped with). This is a simple weight-tiered flat estimate of
// Kaspi's own courier-delivery deduction (roughly what "Kaspi Доставка"
// withholds per order, с НДС) -- explicitly NOT sourced from Kaspi, just a
// reasonable illustrative default. Always editable by the seller in the UI;
// never presented as a real quoted number.
export function estimateKaspiDeliveryFee(weightGrams: number): number {
  if (weightGrams <= 500) return 990
  if (weightGrams <= 1000) return 1290
  if (weightGrams <= 3000) return 1690
  if (weightGrams <= 5000) return 2190
  return 2990
}

export type CategoryCommission = { label: string; ratePercent: number }

// Real per-category commission rates, transcribed verbatim from Kaspi's own
// published partner tariff PDF: https://guide.kaspi.kz/cdn/content/pay/product/documents/Magazin/Tarify_Magazina_na_Kaspi_kz_2026.pdf
// (linked from https://guide.kaspi.kz/partner/ru/shop/conditions/commissions,
// page states "Обновлено 28.01.2026"). The source document has thousands of
// rows down to a 5th-level subcategory (e.g. "Автотовары > Автозапчасти >
// Двигатель > Картер двигателя"), each with two published percentages --
// "Комиссия без НДС" (Kaspi's base fee) and "Комиссия с НДС" (базовая ставка
// + Kaspi's 16% VAT on that fee, charged separately per the guide page).
// We use "с НДС" here because that is the real total percentage of the sale
// price Kaspi actually withholds -- the number that matters for a seller's
// cash unit economics, not the pre-VAT accounting figure.
//
// This table collapses that down to ONE rate per TOP-LEVEL category
// ("Категория 1-го уровня"), which is enough for every category we verified
// is uniform across all its subcategories (the overwhelming majority --
// e.g. every single row under Автотовары, Одежда, Строительство и ремонт,
// etc. carries the same rate). A handful of top-level categories are
// genuinely split between two rates depending on subcategory (medicine vs.
// other pharmacy goods, phone accessories vs. phones themselves, pet food
// vs. other pet goods) -- those are listed as two separate entries below.
//
// "Аксессуары" (bags/belts/jewelry-adjacent accessories) is deliberately
// OMITTED: unlike the above, it has no clean majority split -- roughly half
// its subcategories are 12.5% and half are 15.5% with no simple rule to
// collapse it to one number without guessing. Per this feature's own
// design brief: an honestly incomplete list with a manual-entry fallback is
// correct; a plausible-looking wrong number is not. Sellers in that
// category should type their own rate.
export const KASPI_CATEGORY_COMMISSIONS: CategoryCommission[] = [
  { label: 'Автотовары', ratePercent: 12.5 },
  { label: 'Аптека — лекарства', ratePercent: 7.3 },
  { label: 'Аптека — прочее (БАД, медтехника, гигиена, оптика)', ratePercent: 12.5 },
  { label: 'Бытовая техника', ratePercent: 12.5 },
  { label: 'Детские товары', ratePercent: 12.5 },
  { label: 'Досуг, книги', ratePercent: 12.5 },
  { label: 'Канцелярские товары', ratePercent: 12.5 },
  { label: 'Компьютеры', ratePercent: 12.5 },
  { label: 'Красота и здоровье', ratePercent: 12.5 },
  { label: 'Мебель', ratePercent: 12.5 },
  { label: 'Обувь', ratePercent: 12.5 },
  { label: 'Одежда', ratePercent: 12.5 },
  { label: 'Подарки, товары для праздников', ratePercent: 12.5 },
  { label: 'Продукты питания', ratePercent: 7.3 },
  { label: 'Спорт, туризм', ratePercent: 12.5 },
  { label: 'Строительство, ремонт', ratePercent: 12.5 },
  { label: 'ТВ, Аудио, Видео', ratePercent: 12.5 },
  { label: 'Телефоны и гаджеты — смартфоны и гаджеты', ratePercent: 12.5 },
  { label: 'Телефоны и гаджеты — аксессуары (чехлы, кабели, стёкла)', ratePercent: 15.5 },
  { label: 'Товары для дома и дачи', ratePercent: 12.5 },
  { label: 'Товары для животных — корма и лакомства', ratePercent: 7.3 },
  { label: 'Товары для животных — прочее (ветаптека, груминг, аксессуары)', ratePercent: 12.5 },
  { label: 'Украшения', ratePercent: 15.5 },
]
