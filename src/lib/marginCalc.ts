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
//
// Delivery can depend on the price itself (Kaspi's grid steps up with the order
// amount), and then the floor cannot come from one formula: with a tariff passed
// to calculateMargin it is solved tier by tier, see minProfitablePrice.

import { minProfitablePrice, type DeliveryTariff } from '@/lib/kaspiShop/margin'

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
   * Минимальная цена, ₸: наименьшая, начиная с которой ЛЮБАЯ цена выше не
   * убыточна. Без тарифа доставки это просто цена выхода в ноль; с тарифом
   * (доставка растёт скачками вместе с ценой) считается точно по ступеням,
   * и ниже неё возможен карман прибыли под границей ступени (см.
   * minProfitablePrice). null, когда комиссия и налог вместе съедают 100% и
   * более: тогда безубыточной цены не существует ни при какой цене.
   */
  breakEvenPrice: number | null
  monthlyRevenue: number
  monthlyProfit: number
}

/** Отрицательные значения не имеют смысла ни в одном поле — считаем их нулём. */
function clean(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function calculateMargin(
  input: MarginInput,
  /**
   * Доставка как функция цены (тариф Kaspi). Нужна только для минимальной цены:
   * прибыль считается по input.deliveryCost, то есть по доставке для ТЕКУЩЕЙ цены.
   * Без тарифа доставка при поиске порога считается постоянной.
   */
  options?: { deliveryTariff?: DeliveryTariff },
): MarginResult {
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

  // P - P*(c+t)/100 = fixed  =>  P = fixed / (1 - (c+t)/100), where fixed includes
  // the delivery as long as that does not depend on the price.
  const takenShare = (commissionPercent + taxPercent) / 100
  const breakEvenPrice = minProfitablePrice({
    share: takenShare,
    fixed: costPrice + otherCosts,
    delivery: options?.deliveryTariff ?? deliveryCost,
  })

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
