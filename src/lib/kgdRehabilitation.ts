// Реабилитационная процедура контрагента (26.10.2026): список должников КГД,
// в отношении которых действует реабилитационная процедура.
//
// У КГД нет поиска по БИН: сервис bankrupt-service отдаёт список целиком (около
// 350 записей, 650 КБ, 17 секунд). Поэтому раз в сутки его скачивает крон
// /api/cron/kgd-rehabilitation (src/lib/kgdRehabilitationSync.ts) и складывает в
// таблицу kgd_rehabilitation_debtors, а проверка по БИН читает одну строку.
//
// Всё СПЯЩЕЕ, пока основатель не применил supabase/migrations/
// kgd_rehabilitation_debtors.sql: без таблицы fetchRehabilitation отвечает
// undefined, и строка «Реабилитация» нигде не показывается.
//
// Правило проекта: «не проверено» (null) никогда не превращается в «чисто».
//   undefined                      - фича не включена (таблицы нет), строки нет;
//   null                           - не проверили (таблица пуста, выгрузка старше
//                                    трёх суток, ошибка запроса);
//   {state:'not_listed'}           - выгрузка свежая, БИН в ней нет;
//   {state:'listed'}               - процедура действует;
//   {state:'terminated'}           - прекращена определением суда.
//
// Персональные данные из ответа КГД (ФИО администраторов, директоров,
// учредителей, телефоны, почты, ИИН директоров) не читаются, не хранятся и не
// логируются: парсер берёт четыре поля.

import type { SupabaseClient } from '@supabase/supabase-js'

const KGD_BANKRUPT_BASE = 'https://portal.kgd.gov.kz/services/isnaportal/public/bankrupt-service'
/** Весь список с реабилитационной процедурой (POST, тело с procedureType). */
export const KGD_REHAB_ALL_URL = `${KGD_BANKRUPT_BASE}/debtors/all`
/** Лица, у которых реабилитацию прекратил суд (POST, тело без procedureType). */
export const KGD_REHAB_TERMINATED_URL = `${KGD_BANKRUPT_BASE}/debtors`

export const REHAB_TABLE = 'kgd_rehabilitation_debtors'
/** Выгрузка старше этого срока считается отставшей: ответ «не проверено». */
export const REHAB_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

export type RehabilitationKind = 'rehabilitation' | 'terminated'

export interface RehabilitationRow {
  identifier: string
  kind: RehabilitationKind
  name: string | null
  /** ISO-дата YYYY-MM-DD или null. */
  entry_force_date: string | null
  region: string | null
}

export type RehabilitationState = 'listed' | 'terminated' | 'not_listed'

export interface RehabilitationResult {
  state: RehabilitationState
  /** ISO-дата вступления решения в силу; null/нет = у КГД не указана. */
  since?: string | null
  region?: string | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const text = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/** 'DD.MM.YYYY' -> 'YYYY-MM-DD'; всё остальное (в том числе несуществующая дата) -> null. */
export function parseKgdDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
  if (d.getUTCFullYear() !== Number(yyyy) || d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) return null
  return `${yyyy}-${mm}-${dd}`
}

const ALMATY_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit',
})

/**
 * Момент из ответа КГД ('2024-08-21T19:00:00Z', это полночь по Алматы) -> календарная
 * дата по Алматы. Простое отрезание «T...» дало бы день раньше.
 */
export function parseIsoInstantToAlmatyDay(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return null
  const day = ALMATY_DAY.format(new Date(t))
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

export interface ParsedRehabilitationList {
  rows: RehabilitationRow[]
  /** Сколько записей не удалось разобрать (нет debtorData или БИН не из 12 цифр). */
  malformed: number
}

/** Допустимая доля неразобранных записей. Выше: форма ответа поменялась, это ошибка. */
const MAX_MALFORMED_SHARE = 0.1

function parseItems(
  payload: unknown,
  build: (item: Record<string, unknown>, debtor: Record<string, unknown>, identifier: string) => RehabilitationRow | undefined,
): ParsedRehabilitationList | null {
  if (!isRecord(payload) || !Array.isArray(payload.response)) return null
  const items = payload.response
  const rows: RehabilitationRow[] = []
  let malformed = 0
  for (const item of items) {
    const debtor = isRecord(item) && isRecord(item.debtorData) ? item.debtorData : null
    const identifier = debtor && typeof debtor.identifier === 'string' ? debtor.identifier.trim() : ''
    if (!isRecord(item) || !debtor || !/^\d{12}$/.test(identifier)) {
      malformed += 1
      continue
    }
    const row = build(item, debtor, identifier)
    if (row) rows.push(row)
  }
  if (items.length > 0 && malformed / items.length > MAX_MALFORMED_SHARE) return null
  return { rows, malformed }
}

const nameOf = (d: Record<string, unknown>) => text(d.debtorNameRu) ?? text(d.debtorName) ?? text(d.debtorNameKk)
const regionOf = (d: Record<string, unknown>) => text(d.regionRu, 120) ?? text(d.regionKk, 120)

/**
 * Ответ debtors/all. Читаем только debtorData.{identifier, debtorName*, region*,
 * procedureType} и entryForceDate. Записи с procedureType не REHABILITATION
 * пропускаются. Неожиданная форма (нет response-массива, слишком много записей без
 * БИН) даёт null: вызывающий ничего не пишет в базу.
 */
export function parseRehabilitationAll(payload: unknown): ParsedRehabilitationList | null {
  return parseItems(payload, (item, debtor, identifier) => {
    if (typeof debtor.procedureType === 'string' && debtor.procedureType !== 'REHABILITATION') return undefined
    return {
      identifier,
      kind: 'rehabilitation',
      name: nameOf(debtor),
      entry_force_date: parseKgdDate(item.entryForceDate),
      region: regionOf(debtor),
    }
  })
}

/**
 * Ответ debtors (реабилитация прекращена). Берём только записи со статусом
 * PROCEDURE_TERMINATED. Дата - вступление в силу определения (courtDecision.
 * entryForceDate, момент в UTC, переводится в день по Алматы).
 */
export function parseRehabilitationTerminated(payload: unknown): ParsedRehabilitationList | null {
  return parseItems(payload, (item, debtor, identifier) => {
    const decision = isRecord(item.courtDecision) ? item.courtDecision : null
    if (!decision || decision.status !== 'PROCEDURE_TERMINATED') return undefined
    return {
      identifier,
      kind: 'terminated',
      name: nameOf(debtor),
      entry_force_date: parseIsoInstantToAlmatyDay(decision.entryForceDate),
      region: regionOf(debtor),
    }
  })
}

/**
 * Склейка двух списков в одну строку на БИН.
 *
 * Измерено вживую 26.10.2026: 14 из 23 БИН с прекращённой реабилитацией продолжают
 * числиться и в общем списке debtors/all (их запись там старше определения о
 * прекращении: список КГД отстаёт). Поэтому «реабилитация приоритетнее» тут
 * уточнено: прекращение побеждает, если известны обе даты и определение о
 * прекращении не раньше записи о процедуре. Иначе (даты нет или процедура
 * новее) остаётся rehabilitation: ошибиться в сторону «числится» осторожнее,
 * чем в сторону «чисто».
 *
 * Дубли внутри списка (один БИН дважды): берём запись с самой поздней датой,
 * датированная лучше недатированной.
 */
export function mergeRehabilitationRows(
  rehabilitation: readonly RehabilitationRow[],
  terminated: readonly RehabilitationRow[],
): RehabilitationRow[] {
  const latest = (rows: readonly RehabilitationRow[]) => {
    const by = new Map<string, RehabilitationRow>()
    for (const r of rows) {
      const prev = by.get(r.identifier)
      if (!prev) { by.set(r.identifier, r); continue }
      const a = prev.entry_force_date
      const b = r.entry_force_date
      if ((b && !a) || (a && b && b > a)) by.set(r.identifier, r)
    }
    return by
  }
  const rehab = latest(rehabilitation)
  const term = latest(terminated)
  const out = new Map<string, RehabilitationRow>(rehab)
  for (const [id, t] of term) {
    const r = rehab.get(id)
    if (!r) { out.set(id, t); continue }
    if (t.entry_force_date && r.entry_force_date && t.entry_force_date >= r.entry_force_date) out.set(id, t)
  }
  return [...out.values()]
}

/** Таблицы нет в базе: код Postgres 42P01, PostgREST PGRST205 или текст про relation/table (не «column ... does not exist»). */
export function isMissingRehabTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  return /relation .* does not exist|could not find the table/i.test(error.message || '')
}

/**
 * Проверка БИН по выгруженному списку.
 * undefined: таблицы нет (фича не включена). null: не проверено. Иначе ответ.
 */
export async function fetchRehabilitation(
  supabase: SupabaseClient,
  bin: string,
  now: number = Date.now(),
): Promise<RehabilitationResult | null | undefined> {
  if (!/^\d{12}$/.test(bin)) return null
  try {
    const [fresh, row] = await Promise.all([
      supabase.from(REHAB_TABLE).select('fetched_at').order('fetched_at', { ascending: false }).limit(1),
      supabase.from(REHAB_TABLE).select('kind, entry_force_date, region').eq('identifier', bin).maybeSingle(),
    ])
    if (isMissingRehabTable(fresh.error) || isMissingRehabTable(row.error)) return undefined
    if (fresh.error || row.error) {
      console.error('rehabilitation: read failed:', (fresh.error ?? row.error)?.message)
      return null
    }
    const latest = fresh.data?.[0]?.fetched_at
    // Пустая таблица: крон ещё не отработал. Это «не проверено», не «чисто».
    if (typeof latest !== 'string') return null
    const at = Date.parse(latest)
    if (!Number.isFinite(at) || now - at > REHAB_MAX_AGE_MS) return null

    if (!row.data) return { state: 'not_listed' }
    const kind = row.data.kind
    if (kind !== 'rehabilitation' && kind !== 'terminated') return null
    return {
      state: kind === 'rehabilitation' ? 'listed' : 'terminated',
      since: typeof row.data.entry_force_date === 'string' ? row.data.entry_force_date : null,
      region: typeof row.data.region === 'string' ? row.data.region : null,
    }
  } catch (e) {
    console.error('rehabilitation: lookup failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Что отдаём наружу (публичный /api/tools/kontragent и /api/bin-lookup): только
 * state, since, region, и только проверенные по форме. undefined остаётся
 * undefined (поле не показывается), null остаётся null.
 */
export function publicRehabilitation(
  r: RehabilitationResult | null | undefined,
): RehabilitationResult | null | undefined {
  if (r === undefined) return undefined
  if (r === null || (r.state !== 'listed' && r.state !== 'terminated' && r.state !== 'not_listed')) return null
  return {
    state: r.state,
    since: typeof r.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.since) ? r.since : null,
    region: typeof r.region === 'string' ? r.region.slice(0, 120) : null,
  }
}
