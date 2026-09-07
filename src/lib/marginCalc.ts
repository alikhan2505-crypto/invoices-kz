// Unit economics for a Kaspi seller: what one sale actually leaves you with
// after Kaspi's commission, delivery, tax and whatever else you spend on it.
//
// Lives here rather than inside the page so the arithmetic can be tested. Two
// things in particular are easy to get subtly wrong and impossible to notice
// from the UI:
//
//   - commission and turnover tax are charged on the SELLING price, not on the
//     cost, so they grow as you raise the price and never cancel out;
//   - the break-even price is therefore not "cost + fixed expenses" -- it has
//     to be solved for, because raising the price also raises what is taken
//     off it.
//
// A seller who prices from a wrong floor loses money on every single order and
// only finds out at the end of the month.

export interface MarginInput {
  /** Себестоимость единицы товара, ₸ */
  costPrice: number
  /** Цена продажи на Kaspi, ₸ */
  sellPrice: number
  /** Комиссия Kaspi, % от цены продажи */
  commissionPercent: number
  /** Доставка на единицу, ₸ */
  deliveryCost: number
  /** Налог с оборота, % от цены продажи (ИП на упрощёнке в РК — 3%) */
  taxPercent: number
  /** Прочие расходы на единицу, ₸ (упаковка, реклама, возвраты) */
  otherCosts: number
  /** Продаж в месяц, шт */
  monthlyUnits: number
}

export interface MarginResult {
  /** Комиссия Kaspi в тенге с одной продажи */
  commission: number
  /** Налог в тенге с одной продажи */
  tax: number
  /** Все расходы на одну продажу, включая себестоимость */
  totalCosts: number
  /** Прибыль с одной продажи, ₸ (может быть отрицательной) */
  profitPerUnit: number
  /** Маржинальность: доля прибыли в цене продажи, % */
  marginPercent: number
  /**
   * Наценка: прибыль к себестоимости, %. null, когда себестоимость не
   * указана -- наценка на ноль не определена, и показывать вместо неё
   * бесконечность или 0 одинаково вводит в заблуждение.
   */
  markupPercent: number | null
  /**
   * Минимальная цена, при которой сделка выходит в ноль, ₸. null, когда
   * комиссия и налог вместе съедают 100% и более: тогда безубыточной цены
   * не существует ни при какой цене.
   */
  breakEvenPrice: number | null
  monthlyRevenue: number
  monthlyProfit: number
}

/** Отрицательные значения не имеют смысла ни в одном поле — считаем их нулём. */
function clean(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function calculateMargin(input: MarginInput): MarginResult {
  const costPrice = clean(input.costPrice)
  const sellPrice = clean(input.sellPrice)
  const deliveryCost = clean(input.deliveryCost)
  const otherCosts = clean(input.otherCosts)
  const monthlyUnits = clean(input.monthlyUnits)
  // Percentages are capped at 100: a commission above the whole price is a
  // typo, and letting it through produces a "profit" that grows as the price
  // falls, which reads as a working calculator giving nonsense.
  const commissionPercent = Math.min(clean(input.commissionPercent), 100)
  const taxPercent = Math.min(clean(input.taxPercent), 100)

  const commission = sellPrice * (commissionPercent / 100)
  const tax = sellPrice * (taxPercent / 100)
  const totalCosts = costPrice + deliveryCost + otherCosts + commission + tax
  const profitPerUnit = sellPrice - totalCosts

  const marginPercent = sellPrice > 0 ? (profitPerUnit / sellPrice) * 100 : 0
  const markupPercent = costPrice > 0 ? (profitPerUnit / costPrice) * 100 : null

  // P - P*(c+t)/100 = fixed  =>  P = fixed / (1 - (c+t)/100)
  const takenShare = (commissionPercent + taxPercent) / 100
  const fixedCosts = costPrice + deliveryCost + otherCosts
  const breakEvenPrice = takenShare >= 1 ? null : fixedCosts / (1 - takenShare)

  return {
    commission,
    tax,
    totalCosts,
    profitPerUnit,
    marginPercent,
    markupPercent,
    breakEvenPrice,
    monthlyRevenue: sellPrice * monthlyUnits,
    monthlyProfit: profitPerUnit * monthlyUnits,
  }
}
