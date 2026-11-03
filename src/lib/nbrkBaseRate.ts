// Базовая ставка Национального банка РК: единственное место, где записано число,
// от которого считают законную неустойку (ст. 353 ГК РК). Гайды «Пеня за
// просрочку» (ru, kk) берут отсюда ставку, даты и числа примера. Менять здесь
// при каждом решении НБ (следующее: см. nextDecision) и обновлять verifiedOn.
// Первоисточник: nationalbank.kz (решение Правления НБ о базовой ставке).
export const NBRK_BASE_RATE = {
  percent: 15.75,
  /** Решение НБ, по которому ставка установлена. */
  decisionDate: '23.10.2026',
  /** С какого дня действует. */
  effectiveFrom: '27.10.2026',
  /** Следующее плановое заседание. */
  nextDecision: '04.12.2026',
  /** Когда числа сверяли в последний раз. */
  verifiedOn: '02.11.2026',
} as const

/** «15,75»: запятая как десятичный знак и в русском, и в казахском тексте. */
export function formatPercent(percent: number): string {
  return String(percent).replace('.', ',')
}

/** «0,1575»: ставка как доля единицы для строки с формулой. */
export function formatRateFraction(percent: number): string {
  return String(Math.round(percent * 100) / 10000).replace('.', ',')
}

/** Неустойка по формуле гайда: долг × ставка × дни / 365, до целого тенге. */
export function legalPenalty(debt: number, days: number, percent: number = NBRK_BASE_RATE.percent): number {
  return Math.round(debt * (percent / 100) * days / 365)
}

/** «25 890»: пробел-разделитель тысяч (как в остальных текстах сайта). */
export function formatTenge(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
