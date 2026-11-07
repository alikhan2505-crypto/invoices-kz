import type { MetricSummary, QualityOverview } from './quality'

// Что показать крупным числом на странице «Качество» (аудит K31).
//
// В ответе Kaspi у каждого показателя есть goodValue, violationValue и percentage.
// По живому захвату (quality.test.ts: lateKaspiDelivery numerator 0, denominator 7,
// goodValue 5.0, percentage 0.0) goodValue это порог «зелёной зоны», то есть ЦЕЛЬ, а
// не текущее значение продавца: 0 задержек из 7 не могут давать 5%. Текущее значение
// лежит в percentage. Страница раньше выводила goodValue как «текущее».

export type RatingStatistics = QualityOverview['rating']['statistics']

/** Средняя оценка по распределению оценок за период; null, если оценок нет. */
export function averageFromStatistics(stats: RatingStatistics | null | undefined): { average: number | null; count: number } {
  if (!stats) return { average: null, count: 0 }
  const counts = [stats.oneCount, stats.twoCount, stats.threeCount, stats.fourCount, stats.fiveCount].map(n => (Number.isFinite(Number(n)) ? Number(n) : 0))
  const count = counts.reduce((a, b) => a + b, 0)
  if (count <= 0) return { average: null, count: 0 }
  const sum = counts.reduce((acc, n, i) => acc + n * (i + 1), 0)
  return { average: sum / count, count }
}

export type MetricDisplay = {
  /** Текущее значение продавца: процент, либо средняя оценка. null -- считать нечем. */
  value: number | null
  /** Цель Kaspi (goodValue): «не выше» для процентов, «не ниже» для оценки. */
  target: number
  /** Порог, после которого начинаются санкции (violationValue). */
  limit: number
  unit: 'rating' | 'percent'
}

export function metricDisplay(
  unit: 'rating' | 'percent',
  metric: MetricSummary,
  statistics?: RatingStatistics | null,
): MetricDisplay {
  if (unit === 'rating') {
    // Для оценки percentage по захватам не расшифрован, поэтому среднее считаем из
    // распределения оценок, а не выдумываем.
    return { value: averageFromStatistics(statistics).average, target: metric.goodValue, limit: metric.violationValue, unit }
  }
  const p = Number(metric.percentage)
  return { value: Number.isFinite(p) ? p : null, target: metric.goodValue, limit: metric.violationValue, unit }
}
