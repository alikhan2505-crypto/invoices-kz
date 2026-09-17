export type SalonService = {
  name: string
  price: string
  duration?: string
}

export type SalonData = {
  name: string
  city: string
  address: string
  phone: string
  whatsapp?: string
  instagram?: string
  about?: string
  services: SalonService[]
  masters?: string[]
  workingHours?: string
  styleNotes?: string
  // Настоящие цитаты клиентов, вставленные владельцем вручную (например,
  // скопированные с 2ГИС/Google-карт) -- единственный способ дать модели
  // реальные отзывы. Автоматически со стороннего сайта их не тянем: 2ГИС
  // отдаёт ботам страницу-заглушку вместо контента, подтверждено вживую
  // 2026-09-17 (см. generateLanding.ts).
  reviews?: string[]
  // Короткая строка вроде "4.6 из 5 · 209 оценок" -- тоже вручную, тоже
  // только реальное число с публичной страницы отзывов.
  ratingBadge?: string
}

export type SalonSite = {
  id: string
  slug: string
  salon: SalonData
  pattern: string
  status: 'draft' | 'published'
  published_variant_id: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export type SalonSiteVariant = {
  id: string
  site_id: string
  variant_no: number
  direction: string
  html: string
  created_at: string
}
