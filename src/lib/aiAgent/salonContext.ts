import type { SupabaseClient } from '@supabase/supabase-js'

export type SalonInfo = {
  siteId: string
  name: string
  services: string[]
  masters: string[]
  workingHours?: string
  upcomingBookings: { startsAt: string; masterName: string | null }[]
}

// Loads a salon's own services/masters/hours (+ this week's confirmed
// bookings, so the model can avoid proposing an already-taken slot) for
// injection into the prompt -- same best-effort, never-throw contract as
// loadAgentCatalog (catalogContext.ts): any failure here must never break
// the reply pipeline, it just omits the block.
export async function loadAgentSalonInfo(
  supabase: SupabaseClient,
  siteId: string,
): Promise<SalonInfo | null> {
  try {
    const { data: site } = await supabase.from('salon_sites').select('salon').eq('id', siteId).maybeSingle()
    if (!site?.salon || typeof site.salon !== 'object' || Array.isArray(site.salon)) return null
    const salon = site.salon as Record<string, unknown>

    const name = typeof salon.name === 'string' ? salon.name : ''
    const services = Array.isArray(salon.services)
      ? salon.services
          .map((s) => (s && typeof s === 'object' ? String((s as Record<string, unknown>).name || '') : ''))
          .filter(Boolean)
      : []
    const masters = Array.isArray(salon.masters) ? salon.masters.filter((m): m is string => typeof m === 'string') : []
    const workingHours = typeof salon.workingHours === 'string' ? salon.workingHours : undefined

    const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: bookings } = await supabase
      .from('salon_bookings')
      .select('starts_at, master_name')
      .eq('site_id', siteId)
      .eq('status', 'confirmed')
      .gte('starts_at', new Date().toISOString())
      .lte('starts_at', weekAhead)
      .order('starts_at', { ascending: true })
      .limit(50)

    return {
      siteId,
      name,
      services,
      masters,
      workingHours,
      upcomingBookings: (bookings || []).map((b) => ({ startsAt: b.starts_at, masterName: b.master_name })),
    }
  } catch {
    return null
  }
}

// "Today" for the prompt, at the salon's fixed UTC+5 offset -- see
// bookingDrafts.ts's own comment on why no timezone library is needed.
function todayInAlmaty(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Pure formatter -- mirrors buildCatalogBlock's shape (promptContext.ts).
// Kept OUT of the universal businessContextLine so every non-salon agent's
// prompt stays byte-for-byte unchanged; callers append this only when the
// agent has salon_site_id set.
export function buildSalonBlock(info: SalonInfo): string {
  const lines = [`Сегодняшняя дата: ${todayInAlmaty()} (часовой пояс салона: Алматы, UTC+5).`]
  if (info.services.length) lines.push(`Услуги: ${info.services.join(', ')}.`)
  if (info.masters.length) lines.push(`Мастера: ${info.masters.join(', ')}.`)
  if (info.workingHours) lines.push(`Часы работы: ${info.workingHours}.`)
  if (info.upcomingBookings.length) {
    const busy = info.upcomingBookings
      .map((b) => {
        const when = new Date(b.startsAt).toLocaleString('ru-KZ', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' })
        return b.masterName ? `${when} (${b.masterName})` : when
      })
      .join('; ')
    lines.push(`Уже занятые слоты на ближайшую неделю: ${busy}.`)
  }
  return `Данные салона «${info.name}»:\n${lines.join('\n')}`
}
