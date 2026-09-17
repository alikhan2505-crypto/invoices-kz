import type { SalonData, SalonService } from './types'

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/
const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'smtp', 'ftp', 'cdn', 'static', 'invoices', 'shop', 'pay']

export function parseSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const slug = value.trim().toLowerCase()
  if (!SLUG_RE.test(slug) || RESERVED.includes(slug)) return null
  return slug
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optional(value: unknown): string | undefined {
  const s = str(value)
  return s || undefined
}

// Данные приходят из админской формы, но валидируем всё равно: строка отсюда
// уезжает в промпт модели и в HTML лендинга.
export function parseSalonData(input: unknown): SalonData | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>

  const name = str(raw.name)
  const city = str(raw.city)
  const address = str(raw.address)
  const phone = str(raw.phone)
  if (!name || !city || !address || !phone) return null

  const services: SalonService[] = Array.isArray(raw.services)
    ? raw.services
        .map((item): SalonService | null => {
          if (!item || typeof item !== 'object') return null
          const service = item as Record<string, unknown>
          const serviceName = str(service.name)
          const price = str(service.price)
          if (!serviceName || !price) return null
          return { name: serviceName, price, duration: optional(service.duration) }
        })
        .filter((s): s is SalonService => s !== null)
    : []

  if (services.length === 0) return null

  const masters = Array.isArray(raw.masters)
    ? raw.masters.map(str).filter(Boolean)
    : []

  // Один отзыв -- одна строка, до разумной длины: это цитата клиента, а не
  // сочинение, и слишком длинная "строка" обычно значит, что кто-то вставил
  // не то поле.
  const reviews = Array.isArray(raw.reviews)
    ? raw.reviews.map(str).filter(Boolean).map((r) => r.slice(0, 400))
    : []

  return {
    name,
    city,
    address,
    phone,
    whatsapp: optional(raw.whatsapp),
    instagram: optional(raw.instagram),
    about: optional(raw.about),
    services,
    masters: masters.length ? masters : undefined,
    workingHours: optional(raw.workingHours),
    styleNotes: optional(raw.styleNotes),
    reviews: reviews.length ? reviews.slice(0, 12) : undefined,
    ratingBadge: optional(raw.ratingBadge),
  }
}
