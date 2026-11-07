// Тексты и цвета страницы «Качество». Kaspi присылает коды метрик и уровней на английском
// (LATE_KASPI_DELIVERY, WARNING), а статус категории может быть и «Нарушение»: раньше код
// печатался сырым, а бейдж статуса всегда был зелёным (прогон воронки Kaspi 07.11.2026).

const METRIC_LABELS: Record<string, string> = {
  LATE_KASPI_DELIVERY: 'Задержки доставки Kaspi',
  LATE_SELLER_DELIVERY: 'Задержки доставки продавцом',
  LATE_PICKUP: 'Задержки передачи заказов',
  LATE_ASSEMBLY: 'Задержки сборки заказов',
  CANCELLATION: 'Отмены заказов',
  CANCELLATIONS: 'Отмены заказов',
  RETURNS: 'Возвраты',
  REFUND: 'Возвраты',
  COMPLAINTS: 'Жалобы покупателей',
}

export function qualityMetricLabel(metric: unknown): string {
  const key = typeof metric === 'string' ? metric.trim() : ''
  if (!key) return 'Показатель'
  return METRIC_LABELS[key.toUpperCase()] ?? key
}

export type QualityTone = 'critical' | 'warning' | 'ok'

// Нарушение и «плохо» красные, предупреждение и риск жёлтые, всё остальное зелёное.
export function qualityTone(status: unknown): QualityTone {
  const s = typeof status === 'string' ? status.trim().toUpperCase() : ''
  if (/VIOL|BAD|CRIT|FAIL|ERROR|НАРУШ|ПЛОХ/.test(s)) return 'critical'
  if (/WARN|RISK|ПРЕДУПР|РИСК/.test(s)) return 'warning'
  return 'ok'
}

export function qualityLevelLabel(level: unknown): string {
  const tone = qualityTone(level)
  const raw = typeof level === 'string' ? level.trim() : ''
  if (tone === 'critical') return 'нарушение'
  if (tone === 'warning') return 'предупреждение'
  return raw ? raw.toLowerCase() : 'в норме'
}

export function qualityStatusLabel(status: unknown): string {
  const tone = qualityTone(status)
  const raw = typeof status === 'string' ? status.trim() : ''
  if (/^[A-Z_]+$/.test(raw)) {
    if (tone === 'critical') return 'Нарушение'
    if (tone === 'warning') return 'Предупреждение'
    if (/GOOD|OK|NORMAL|PASS/i.test(raw)) return 'В норме'
  }
  return raw
}

export function qualityToneStyle(tone: QualityTone): { background: string; color: string } {
  if (tone === 'critical') return { background: 'var(--nav-critical)', color: '#fff' }
  if (tone === 'warning') return { background: 'var(--nav-warning)', color: '#1C1917' }
  return { background: 'var(--nav-success-solid)', color: 'var(--nav-success-ink)' }
}
