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

// Almaty "now" as a Date whose UTC getters read as Almaty local time -- the
// same fixed +05:00 shift bookingDrafts.ts uses, just kept as a Date here
// instead of a string so both the date AND the weekday can be read off it.
function almatyNow(offsetDays = 0): Date {
  return new Date(Date.now() + 5 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000)
}

const WEEKDAY_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

// Exported for its own colocated test (cross-checked against Intl's
// independent weekday calculation, not just re-asserting this same table)
// -- same exception this codebase already makes for other pure pieces of
// an otherwise time-dependent module.
export function formatWithWeekday(d: Date): string {
  return `${d.toISOString().slice(0, 10)} (${WEEKDAY_RU[d.getUTCDay()]})`
}

// Live incident 18.09.2026, round two: after the date/weekday fix below,
// the model correctly resolved "пятница" to today's date -- but a
// customer asked at 21:58 for "пятница в 15:00" (today, 7 hours ago) and
// the model confirmed it as if it were a normal future slot, having never
// been told what time it currently is, only what date. Fixed by handing
// over the current time alongside the date; validateBookingInput
// (bookingDrafts.ts) is the real backstop that refuses it server-side
// regardless of what the model does with this.
function formatWithTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${formatWithWeekday(d)}, ${hh}:${mm}`
}

// Live incident 18.09.2026: given only a bare "Сегодняшняя дата: 2026-09-18"
// with no weekday, the model was asked to book "пятница" and answered with
// a date that wasn't even a Friday -- a Haiku-tier model reliably computing
// day-of-week arithmetic from an ISO date alone is not a safe assumption
// for something that decides which day a real customer shows up on. Fix:
// never make the model calculate a date at all -- hand it a ready lookup
// table for the next two weeks (each date with its weekday spelled out) so
// "пятница"/"завтра"/"через неделю" is a read, not a computation.
function nextTwoWeeksTable(): string {
  return Array.from({ length: 14 }, (_, i) => formatWithWeekday(almatyNow(i))).join(', ')
}

// Pure formatter -- mirrors buildCatalogBlock's shape (promptContext.ts).
// Kept OUT of the universal businessContextLine so every non-salon agent's
// prompt stays byte-for-byte unchanged; callers append this only when the
// agent has salon_site_id set.
export function buildSalonBlock(info: SalonInfo): string {
  const lines = [
    `Сейчас: ${formatWithTime(almatyNow(0))} (часовой пояс салона: Алматы, UTC+5). Если клиент просит время сегодняшним же днём, которое уже прошло относительно текущего времени -- не подтверждай его как есть, сначала уточни другое время.`,
    `Даты на ближайшие две недели по дням недели: ${nextTwoWeeksTable()}. Когда клиент называет день недели, "завтра", "послезавтра" или "через неделю" -- бери ТОЧНУЮ дату из этого списка, никогда не вычисляй её самостоятельно.`,
  ]
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
