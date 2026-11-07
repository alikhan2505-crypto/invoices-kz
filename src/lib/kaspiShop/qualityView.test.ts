import { describe, it, expect } from 'vitest'
import { metricDisplay, averageFromStatistics } from './qualityView'
import type { MetricSummary } from './quality'

// Метрика из живого захвата quality.test.ts: lateKaspiDelivery 0 из 7, goodValue 5.0.
const late: MetricSummary = {
  goodValue: 5.0, violationValue: 10.0, zonePercentage: 100.0, percentage: 0.0,
  daysPerPeriod: 30, from: 'a', to: 'b', notEnoughData: true, numerator: 0, denominator: 7,
}

describe('qualityView: что считать текущим значением (аудит K31)', () => {
  it('для процентной метрики текущее значение это percentage, а goodValue это цель', () => {
    const d = metricDisplay('percent', late)
    expect(d.value).toBe(0) // 0 задержек из 7, а не 5%
    expect(d.target).toBe(5)
    expect(d.limit).toBe(10)
  })

  it('настоящий процент отдаётся как есть', () => {
    const d = metricDisplay('percent', { ...late, percentage: 3.4, numerator: 4, denominator: 118, notEnoughData: false })
    expect(d.value).toBe(3.4)
  })

  it('нечисловой percentage это «неизвестно», а не подмена goodValue', () => {
    const d = metricDisplay('percent', { ...late, percentage: undefined as any })
    expect(d.value).toBeNull()
  })

  it('рейтинг: среднее считается из распределения оценок, goodValue остаётся целью', () => {
    const rating: MetricSummary = { ...late, goodValue: 4.6, violationValue: 4.0, percentage: 0, notEnoughData: false }
    const d = metricDisplay('rating', rating, { oneCount: 0, twoCount: 0, threeCount: 1, fourCount: 1, fiveCount: 2 })
    expect(d.value).toBeCloseTo((3 + 4 + 10) / 4, 5)
    expect(d.target).toBe(4.6)
  })

  it('рейтинг без оценок: значения нет (в захвате 0 оценок и goodValue 4.6), а не 4.6', () => {
    const rating: MetricSummary = { ...late, goodValue: 4.6, violationValue: 4.0 }
    const d = metricDisplay('rating', rating, { oneCount: 0, twoCount: 0, threeCount: 0, fourCount: 0, fiveCount: 0 })
    expect(d.value).toBeNull()
    expect(averageFromStatistics(undefined)).toEqual({ average: null, count: 0 })
  })
})
