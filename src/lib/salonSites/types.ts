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
  // реальные отзывы. Тексты отзывов не тянем автоматически ни со стороннего
  // сайта (2ГИС отдаёт ботам страницу-заглушку, подтверждено вживую
  // 2026-09-17), ни через официальный API 2ГИС (он отдаёт только
  // агрегированный рейтинг, без текстов) -- см. fetch2gis.ts.
  reviews?: string[]
  // Короткая строка вроде "4.6 ★ · 209 оценок". Можно подтянуть
  // автоматически по ссылке на 2ГИС (fetch2gis.ts, официальный API,
  // agregированный рейтинг) или вписать вручную с любой другой площадки.
  ratingBadge?: string
  // Координаты с 2ГИС (fetch2gis.ts, items.point) -- если есть, лендинг
  // получает настоящую кнопку "Как доехать" на Google-карты вместо простого
  // текстового адреса. Без них секция с картой не добавляется.
  lat?: number
  lon?: number
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
