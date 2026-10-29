import { TOOL_EVENT_MEDIUMS, TOOL_EVENT_TOOLS, type ToolEventMedium, type ToolEventTool } from './schema'

// Чистая сборка воронки бесплатных инструментов для /admin → «Инструменты»
// (GET /api/admin/tool-funnel). Без Supabase и без часов: строки и «сейчас»
// приходят параметрами — так это покрыто тестами (funnel.test.ts).
//
// Определения:
//  - посетители — разные visitor с событием 'view' в инструменте (у строки
//    без visitor — хранилище браузера закрыто — каждая считается отдельным
//    посетителем: склеить их не по чему);
//  - документы / клики / лимиты / лиды — число событий;
//  - % документов и % кликов — доля посетителей, у которых было хотя бы одно
//    такое событие (а не события/посетители: один человек с пятью КП не
//    должен давать 500%). Строки без visitor идут в число событий, но не в
//    «посетителей с документом/кликом»: склеить их со своим просмотром нельзя,
//    и один такой браузер с тремя КП дал бы 300%. Сверху доля ещё и
//    ограничена 100% (просмотр посетителя мог быть до начала периода);
//  - регистрации — события 'signup', приписанные инструменту первого касания,
//    по одной на аккаунт; % — регистрации / посетители;
//  - «наши визиты»: строка с internal=true И все события того же visitor
//    (браузер основателя помечается при открытии /admin, а смотрел он
//    инструменты и до этого), плюс visitor самого браузера, который открыл
//    вкладку (selfVisitors — его ранние визиты ещё без internal-строки), —
//    исключаются, пока не попросили показать.
//  - дни — по Алматы (UTC+5, без перехода на летнее время).

export const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000
export const FUNNEL_PERIODS = [7, 30, 90] as const
export type FunnelPeriod = (typeof FUNNEL_PERIODS)[number]

export interface ToolEventDbRow {
  created_at: string
  event: string
  tool: string
  visitor: string | null
  user_id: string | null
  internal: boolean | null
  medium: string | null
  // Метки захода (колонки есть с первой версии таблицы; необязательны ради
  // старых тестов и строк без метки).
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
}

export interface FunnelCounts {
  visitors: number
  views: number
  docs: number
  docVisitors: number
  limits: number
  cta: number
  ctaVisitors: number
  ctaByMedium: Record<ToolEventMedium | 'other', number>
  leads: number
  signups: number
  docsPct: number | null
  ctaPct: number | null
  signupsPct: number | null
}

export interface FunnelToolRow extends FunnelCounts {
  tool: ToolEventTool
}

// Строка разреза по меткам: источник / канал / кампания. Все три null — заходы
// без метки (прямые, из поиска, из органики).
export interface FunnelSourceRow extends FunnelCounts {
  source: string | null
  medium: string | null
  campaign: string | null
}

export interface FunnelDay {
  day: string // YYYY-MM-DD по Алматы
  visitors: number
  docs: number
  signups: number
}

export interface ToolFunnel {
  days: number
  includeInternal: boolean
  since: string // ISO, начало первого дня периода по Алматы
  tools: FunnelToolRow[]
  totals: FunnelCounts
  // Разрез по utm_source / utm_medium / utm_campaign (все инструменты вместе).
  sources: FunnelSourceRow[]
  // Регистрации без недавнего касания инструмента (tool='none').
  unattributedSignups: number
  series: FunnelDay[]
  rowsConsidered: number
}

export function almatyDay(iso: string | number | Date): string {
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime()
  return new Date(t + ALMATY_OFFSET_MS).toISOString().slice(0, 10)
}

// Начало первого дня периода (полночь по Алматы) в UTC: «7 дней» = сегодня и
// шесть дней до него.
export function periodStart(days: number, now: number): number {
  const today = almatyDay(now)
  const midnightUtc = Date.parse(`${today}T00:00:00Z`) - ALMATY_OFFSET_MS
  return midnightUtc - (days - 1) * 24 * 60 * 60 * 1000
}

export function pct(part: number, whole: number): number | null {
  if (!whole) return null
  return Math.round((part / whole) * 1000) / 10
}

function capPct(v: number | null): number | null {
  return v === null ? null : Math.min(100, v)
}

export function parsePeriod(v: string | null | undefined): FunnelPeriod {
  const n = Number(v)
  return (FUNNEL_PERIODS as readonly number[]).includes(n) ? (n as FunnelPeriod) : 30
}

class Bucket {
  views = 0
  docs = 0
  limits = 0
  cta = 0
  leads = 0
  visitors = new Set<string>()
  docVisitors = new Set<string>()
  ctaVisitors = new Set<string>()
  signupKeys = new Set<string>()
  ctaByMedium = emptyMediums()
}

function emptyMediums(): Record<ToolEventMedium | 'other', number> {
  const m = {} as Record<ToolEventMedium | 'other', number>
  for (const k of TOOL_EVENT_MEDIUMS) m[k] = 0
  m.other = 0
  return m
}

// Метки приводим к одному виду, иначе «TG_chat» и «tg_chat» — две строки.
export function normUtm(v: string | null | undefined): string | null {
  const s = (v ?? '').trim().toLowerCase()
  return s || null
}

export const MAX_SOURCE_ROWS = 100

function finish(b: Bucket): FunnelCounts {
  const visitors = b.visitors.size
  return {
    visitors,
    views: b.views,
    docs: b.docs,
    docVisitors: b.docVisitors.size,
    limits: b.limits,
    cta: b.cta,
    ctaVisitors: b.ctaVisitors.size,
    ctaByMedium: b.ctaByMedium,
    leads: b.leads,
    signups: b.signupKeys.size,
    docsPct: capPct(pct(b.docVisitors.size, visitors)),
    ctaPct: capPct(pct(b.ctaVisitors.size, visitors)),
    signupsPct: pct(b.signupKeys.size, visitors),
  }
}

// Больше посетителей — выше; при равенстве — где больше регистраций и документов.
// Строка «без метки» всегда последняя: разрез нужен ради размеченных ссылок, и
// срез по MAX_SOURCE_ROWS не должен её потерять.
function sortSources(rows: FunnelSourceRow[]): FunnelSourceRow[] {
  const isBlank = (r: FunnelSourceRow) => !r.source && !r.medium && !r.campaign
  const byWeight = (a: FunnelSourceRow, c: FunnelSourceRow) => c.visitors - a.visitors || c.signups - a.signups || c.docs - a.docs
  const labelled = rows.filter(r => !isBlank(r)).sort(byWeight).slice(0, MAX_SOURCE_ROWS)
  return [...labelled, ...rows.filter(isBlank)]
}

export function aggregateToolFunnel(
  rows: ToolEventDbRow[],
  opts: { days: number; includeInternal: boolean; now: number; selfVisitors?: string[] },
): ToolFunnel {
  const sinceMs = periodStart(opts.days, opts.now)

  const internalVisitors = new Set<string>()
  if (!opts.includeInternal) {
    for (const r of rows) if (r.internal && r.visitor) internalVisitors.add(r.visitor)
    for (const v of opts.selfVisitors ?? []) if (v) internalVisitors.add(v)
  }

  const perTool = new Map<ToolEventTool, Bucket>(TOOL_EVENT_TOOLS.map(t => [t, new Bucket()]))
  const total = new Bucket()
  const perSource = new Map<string, { source: string | null; medium: string | null; campaign: string | null; b: Bucket }>()
  const seriesMap = new Map<string, { visitors: Set<string>; docs: number; signups: Set<string> }>()
  for (let t = sinceMs; t <= opts.now; t += 24 * 60 * 60 * 1000) {
    seriesMap.set(almatyDay(t), { visitors: new Set(), docs: 0, signups: new Set() })
  }
  let unattributed = new Set<string>()
  let considered = 0
  let anon = 0

  for (const r of rows) {
    // События формы (tool_form_*, 29.10.2026) в воронку не входят: их читают SQL-запросом.
    if (String(r.event).startsWith('tool_form_')) continue
    const at = Date.parse(r.created_at)
    if (!Number.isFinite(at) || at < sinceMs) continue
    if (!opts.includeInternal && (r.internal || (r.visitor && internalVisitors.has(r.visitor)))) continue
    considered++

    // Посетитель без id — отдельный человек на каждую строку (для
    // посетителей); в «посетителей с документом/кликом» он не попадает.
    const who = r.visitor || `anon:${anon++}`
    const named = !!r.visitor
    const day = seriesMap.get(almatyDay(at))

    if (r.event === 'signup') {
      // Одна регистрация на аккаунт, даже если событие пришло дважды.
      const key = r.user_id || `row:${who}`
      if (day) day.signups.add(key)
      if (r.tool === 'none') { unattributed.add(key); continue }
    }

    const b = perTool.get(r.tool as ToolEventTool)
    if (!b) continue
    const source = normUtm(r.utm_source), medium = normUtm(r.utm_medium), campaign = normUtm(r.utm_campaign)
    const sourceKey = JSON.stringify([source, medium, campaign])
    let sb = perSource.get(sourceKey)
    if (!sb) { sb = { source, medium, campaign, b: new Bucket() }; perSource.set(sourceKey, sb) }
    const buckets = [b, total, sb.b]

    switch (r.event) {
      case 'view':
        for (const x of buckets) { x.views++; x.visitors.add(who) }
        if (day) day.visitors.add(who)
        break
      case 'doc':
        for (const x of buckets) { x.docs++; if (named) x.docVisitors.add(who) }
        if (day) day.docs++
        break
      case 'limit':
        for (const x of buckets) x.limits++
        break
      case 'cta': {
        const m = (TOOL_EVENT_MEDIUMS as readonly string[]).includes(r.medium ?? '') ? (r.medium as ToolEventMedium) : 'other'
        for (const x of buckets) { x.cta++; if (named) x.ctaVisitors.add(who); x.ctaByMedium[m]++ }
        break
      }
      case 'lead':
        for (const x of buckets) x.leads++
        break
      case 'signup': {
        const key = r.user_id || `row:${who}`
        for (const x of buckets) x.signupKeys.add(key)
        break
      }
    }
  }

  // Аккаунт, засчитанный инструменту, не считается ещё и «без инструмента».
  unattributed = new Set([...unattributed].filter(k => !total.signupKeys.has(k)))

  return {
    days: opts.days,
    includeInternal: opts.includeInternal,
    since: new Date(sinceMs).toISOString(),
    tools: TOOL_EVENT_TOOLS.map(tool => ({ tool, ...finish(perTool.get(tool)!) })),
    totals: finish(total),
    sources: sortSources([...perSource.values()].map(x => ({ source: x.source, medium: x.medium, campaign: x.campaign, ...finish(x.b) }))),
    unattributedSignups: unattributed.size,
    series: [...seriesMap.entries()].map(([day, d]) => ({ day, visitors: d.visitors.size, docs: d.docs, signups: d.signups.size })),
    rowsConsidered: considered,
  }
}
