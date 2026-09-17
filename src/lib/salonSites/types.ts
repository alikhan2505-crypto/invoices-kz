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
