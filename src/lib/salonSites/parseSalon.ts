import type { SalonData, SalonMasterCategory, SalonService } from './types'

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/
const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'smtp', 'ftp', 'cdn', 'static', 'invoices', 'shop', 'pay', 'kaspi', 'agent', 'salon', 'docs', 'my', 'wb', 'bot']

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

// Валидный lat/lon: конечное число в разумном географическом диапазоне --
// координаты уезжают прямо в ссылку на Google-карты в тексте промпта,
// поэтому NaN/Infinity/мусор отсекаем здесь, а не полагаемся на fetch2gis.ts.
function optionalCoord(value: unknown, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max ? value : undefined
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

  // Additive grouping for the planner's timeline calendar -- membership
  // isn't cross-checked against `masters` above (a category referencing a
  // name that later gets removed from `masters` is harmless, the planner
  // just won't find a booking for it there).
  const masterCategories: SalonMasterCategory[] = Array.isArray(raw.masterCategories)
    ? raw.masterCategories
        .map((item): SalonMasterCategory | null => {
          if (!item || typeof item !== 'object') return null
          const cat = item as Record<string, unknown>
          const categoryName = str(cat.name)
          const catMasters = Array.isArray(cat.masters) ? cat.masters.map(str).filter(Boolean) : []
          if (!categoryName || catMasters.length === 0) return null
          return { name: categoryName, masters: catMasters }
        })
        .filter((c): c is SalonMasterCategory => c !== null)
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
    masterCategories: masterCategories.length ? masterCategories : undefined,
    workingHours: optional(raw.workingHours),
    styleNotes: optional(raw.styleNotes),
    reviews: reviews.length ? reviews.slice(0, 12) : undefined,
    ratingBadge: optional(raw.ratingBadge),
    lat: optionalCoord(raw.lat, 90),
    lon: optionalCoord(raw.lon, 180),
  }
}
