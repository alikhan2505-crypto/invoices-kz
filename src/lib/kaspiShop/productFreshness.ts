// Строка «когда бот последний раз смотрел товар и менял ли цену» для карточки Демпинга (P13 из
// прогона воронки 07.11.2026). Без неё продавец не видит, живёт ли бот: цена та же, а бот
// мог молчать несколько часов (мёртвая сессия, пауза) или работать, просто нечего менять.

export type FreshnessProduct = {
  enabled: boolean
  available_for_sale?: boolean | null
  last_checked_at: string | null
  last_price_change_at?: string | null
  last_price_change_from?: number | null
  last_price_change_to?: number | null
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** «только что», «12 мин назад», «3 ч назад», «2 дн. назад». null, если дата не читается. */
export function formatAgo(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  // Часы сервера и браузера могут разойтись на секунды: будущее считаем «только что».
  const diff = Math.max(0, now - t)
  if (diff < MIN) return 'только что'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} мин назад`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} ч назад`
  const days = Math.floor(diff / DAY)
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`
}

function tenge(n: number): string {
  return n.toLocaleString('ru-KZ')
}

/**
 * Текст под ценой карточки. null: товар бот не проверяет (на паузе или снят с продажи),
 * там строка про «последнюю проверку» только сбила бы с толку.
 */
export function freshnessLine(p: FreshnessProduct, now: number): string | null {
  if (!p.enabled || p.available_for_sale === false) return null
  const checked = formatAgo(p.last_checked_at, now)
  const parts: string[] = [checked ? `Проверено ${checked}` : 'Ещё не проверялся']
  const changed = formatAgo(p.last_price_change_at, now)
  if (changed) {
    const from = p.last_price_change_from
    const to = p.last_price_change_to
    const range = typeof from === 'number' && typeof to === 'number' ? ` (${tenge(from)} → ${tenge(to)} ₸)` : ''
    parts.push(`цена изменена ${changed}${range}`)
  } else if (checked) {
    parts.push('цену бот ещё не менял')
  }
  return parts.join(' · ')
}
