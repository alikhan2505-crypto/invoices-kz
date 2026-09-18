// Официальный каталог-API 2ГИС (Places API 3.0) -- единственный законный
// способ получить структурированные данные организации без обхода их
// анти-бот защиты (см. types.ts про отзывы). Отдаёт адрес/телефон/часы и
// агрегированный рейтинг, но НЕ тексты самих отзывов -- их по-прежнему
// вставляют вручную.
//
// Ключ: dev.2gis.ru -> Platform Manager -> создать demo-ключ (бесплатный,
// с лимитами). Пока TWO_GIS_API_KEY не задан в окружении -- функция кидает
// понятную ошибку вместо того, чтобы тихо возвращать пустоту.
//
// ID организации извлекается из хвоста ссылки вида
// https://2gis.kz/shymkent/firm/70000001101134746 -- это тот же числовой ID,
// который 2ГИС использует в своих публичных виджетах карт. Не проверено
// вживую с реальным ключом (ключа пока нет) -- если 2ГИС всё же ждёт другой
// формат ID, API ответит 404, и это всплывёт понятной ошибкой при первом
// реальном запросе, а не тихим расхождением.

export type TwoGisPlace = {
  name?: string
  address?: string
  phone?: string
  workingHours?: string
  ratingBadge?: string
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DAY_LABELS: Record<(typeof DAY_ORDER)[number], string> = {
  Mon: 'Пн', Tue: 'Вт', Wed: 'Ср', Thu: 'Чт', Fri: 'Пт', Sat: 'Сб', Sun: 'Вс',
}

function extractFirmId(sourceUrl: string): string | null {
  const match = sourceUrl.match(/\/firm\/(\d+)/)
  return match ? match[1] : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatWorkingHours(entry: unknown): string | null {
  if (!isRecord(entry)) return null
  const hours = entry.working_hours
  if (!Array.isArray(hours) || hours.length === 0) return null
  return hours
    .map((h) => (isRecord(h) ? `${String(h.from ?? '')}–${String(h.to ?? '')}` : ''))
    .filter(Boolean)
    .join(', ')
}

// Схлопывает подряд идущие дни с одинаковыми часами в диапазон (например
// "Пн–Пт 10:00–20:00") вместо перечисления каждого дня отдельно -- иначе
// строка нечитаема и не помещается в поле формы.
function compressDayRuns(days: (typeof DAY_ORDER)[number][]): string {
  const indices = days.map((d) => DAY_ORDER.indexOf(d)).sort((a, b) => a - b)
  const consecutive = indices.length > 1 && indices.every((v, i) => i === 0 || v === indices[i - 1] + 1)
  const labels = indices.map((i) => DAY_LABELS[DAY_ORDER[i]])
  return consecutive ? `${labels[0]}–${labels[labels.length - 1]}` : labels.join(', ')
}

function formatSchedule(schedule: unknown): string | undefined {
  if (!isRecord(schedule)) return undefined
  if (schedule.is_24x7 === true) return 'Круглосуточно'

  const byHours = new Map<string, (typeof DAY_ORDER)[number][]>()
  for (const day of DAY_ORDER) {
    const hours = formatWorkingHours(schedule[day])
    if (!hours) continue
    const days = byHours.get(hours) ?? []
    days.push(day)
    byHours.set(hours, days)
  }

  const parts = [...byHours.entries()].map(([hours, days]) => `${compressDayRuns(days)} ${hours}`)
  return parts.length ? parts.join('; ') : undefined
}

function extractPhone(contactGroups: unknown): string | undefined {
  if (!Array.isArray(contactGroups)) return undefined
  for (const group of contactGroups) {
    if (!isRecord(group) || !Array.isArray(group.contacts)) continue
    const phone = group.contacts.find((c) => isRecord(c) && c.type === 'phone')
    if (isRecord(phone) && typeof phone.value === 'string') return phone.value
  }
  return undefined
}

export async function fetch2gisPlace(sourceUrl: string): Promise<TwoGisPlace> {
  const apiKey = process.env.TWO_GIS_API_KEY
  if (!apiKey) throw new Error('2ГИС API не настроен: нет TWO_GIS_API_KEY (получите demo-ключ на dev.2gis.ru)')

  const firmId = extractFirmId(sourceUrl)
  if (!firmId) throw new Error('не удалось распознать ID организации в этой ссылке 2ГИС')

  const apiUrl = new URL('https://catalog.api.2gis.com/3.0/items/byid')
  apiUrl.searchParams.set('key', apiKey)
  apiUrl.searchParams.set('id', firmId)
  apiUrl.searchParams.set('locale', 'ru_KZ')
  apiUrl.searchParams.set('fields', 'items.full_address_name,items.contact_groups,items.schedule,items.reviews')

  const res = await fetch(apiUrl.toString())
  if (!res.ok) throw new Error(`2ГИС API вернул ошибку (${res.status})`)

  const body: unknown = await res.json()
  const items = isRecord(body) && isRecord(body.result) ? body.result.items : null
  const item = Array.isArray(items) ? items[0] : null
  if (!isRecord(item)) throw new Error('организация не найдена в 2ГИС по этой ссылке')

  const reviews = isRecord(item.reviews) ? item.reviews : null
  const rating = typeof reviews?.rating === 'number' ? reviews.rating : null
  const reviewCount = typeof reviews?.review_count === 'number' ? reviews.review_count : null

  return {
    name: typeof item.name === 'string' ? item.name : undefined,
    address: typeof item.full_address_name === 'string' ? item.full_address_name : undefined,
    phone: extractPhone(item.contact_groups),
    workingHours: formatSchedule(item.schedule),
    ratingBadge: rating !== null ? `${rating.toFixed(1)} ★${reviewCount ? ` · ${reviewCount} оценок` : ''}` : undefined,
  }
}
