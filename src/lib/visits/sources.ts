import { periodStart, normUtm } from '@/lib/toolEvents/funnel'
import { SIGNUP_SOURCE_CLASSES, type SignupSourceClass } from './classify'

// Сводка для /admin → «Инструменты» → блок «Лендинги и регистрации»: заходы на
// публичные страницы (site_visits) по классу источника и по utm_source /
// utm_campaign, плюс регистрации по классу (signup_sources). Окна 7 и 30 дней
// считаются из одной выборки за 30 дней. Чистая функция, без Supabase и часов —
// строки и «сейчас» приходят параметрами (sources.test.ts).
//
// Дни — по Алматы, как в воронке инструментов (periodStart).

export const TRAFFIC_WINDOWS = [7, 30] as const
export const MAX_UTM_ROWS = 100

export interface VisitDbRow {
  created_at: string
  source_class: string
  utm_source: string | null
  utm_campaign: string | null
}

export interface SignupSourceDbRow {
  created_at: string
  source_class: string
}

// Пара [7 дней, 30 дней].
export type PerWindow = [number, number]

export interface TrafficClassRow {
  cls: SignupSourceClass
  visits: PerWindow
  signups: PerWindow
}

export interface TrafficUtmRow {
  source: string | null
  campaign: string | null
  visits: PerWindow
}

export interface TrafficSources {
  windows: readonly [7, 30]
  since: string // ISO, начало самого длинного окна
  classes: TrafficClassRow[]
  totals: { visits: PerWindow; signups: PerWindow; noUtmVisits: PerWindow }
  utm: TrafficUtmRow[]
}

const zero = (): PerWindow => [0, 0]

export function aggregateTraffic(visits: VisitDbRow[], signups: SignupSourceDbRow[], now: number): TrafficSources {
  const since = TRAFFIC_WINDOWS.map(d => periodStart(d, now))
  // В какие окна попадает строка: [в 7 дней, в 30 дней]. Строка из 7 дней — и в 30.
  const inWindows = (iso: string): [boolean, boolean] | null => {
    const at = Date.parse(iso)
    if (!Number.isFinite(at) || at > now + 60_000) return null
    const a = at >= since[0], b = at >= since[1]
    return b ? [a, b] : null
  }
  const add = (p: PerWindow, w: [boolean, boolean]) => { if (w[0]) p[0]++; if (w[1]) p[1]++ }

  const byClass = new Map<string, TrafficClassRow>(
    SIGNUP_SOURCE_CLASSES.map(cls => [cls, { cls, visits: zero(), signups: zero() }]),
  )
  const totals = { visits: zero(), signups: zero(), noUtmVisits: zero() }
  const utm = new Map<string, TrafficUtmRow>()

  for (const r of visits) {
    const w = inWindows(r.created_at)
    if (!w) continue
    add(totals.visits, w)
    const row = byClass.get(r.source_class)
    if (row) add(row.visits, w)
    const source = normUtm(r.utm_source), campaign = normUtm(r.utm_campaign)
    if (!source && !campaign) { add(totals.noUtmVisits, w); continue }
    const key = JSON.stringify([source, campaign])
    let u = utm.get(key)
    if (!u) { u = { source, campaign, visits: zero() }; utm.set(key, u) }
    add(u.visits, w)
  }

  for (const r of signups) {
    const w = inWindows(r.created_at)
    if (!w) continue
    add(totals.signups, w)
    // Незнакомый класс (колонка шире списка) — как «unknown», чтобы сумма сходилась.
    add((byClass.get(r.source_class) ?? byClass.get('unknown')!).signups, w)
  }

  return {
    windows: TRAFFIC_WINDOWS,
    since: new Date(since[1]).toISOString(),
    classes: [...byClass.values()],
    totals,
    utm: [...utm.values()]
      .sort((a, b) => b.visits[1] - a.visits[1] || b.visits[0] - a.visits[0])
      .slice(0, MAX_UTM_ROWS),
  }
}
