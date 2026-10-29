// Признаки риска контрагента для слежения и сравнение двух проверок.
//
// Правило проекта: null = «не проверено», и оно НИКОГДА не становится «чисто».
// Каждый признак трёхзначный: true (есть), false (проверили, нет), null (не
// удалось проверить в этот раз).
//
// Что считается УХУДШЕНИЕМ (и только оно ведёт к письму):
//  - у «плохого» признака (неблагонадёжный, банкрот, ликвидация, статус реестра
//    «ликвидирован/прекращён», налоговая задолженность, исполнительные
//    производства, реабилитационная процедура) переход «известно, что нет» ->
//    «есть». Если признак с момента добавления ни разу не проверялся (в базе
//    null), его первое успешное чтение входит в базу молча, без письма: иначе
//    неполный первый снимок давал бы ложное «появилось» про давнее;
//  - НДС: был плательщиком (true) и стал «снят» (false). null на любой стороне
//    не считается снятием.
// Ничего не ухудшилось, если в этот раз признак просто не проверился (null):
// временный сбой реестра - не улучшение и не ухудшение. Поэтому сравнивать надо с
// «базой» (baseline): последним ИЗВЕСТНЫМ значением каждого признака, а не с
// прошлой проверкой, где мог быть null.
// Улучшение (был -> нет) письма не вызывает, но база обновляется.
// Первая проверка (базы ещё нет) сохраняется без письма.

import type { BinLookupResult } from '@/lib/binLookup'
import type { UnreliableCategory } from '@/lib/kgdTaxpayer'

export type Tri = boolean | null

export const BAD_SIGNAL_KEYS = [
  'unreliable', 'bankrupt', 'liquidating', 'registryClosed', 'taxDebt', 'enforcement', 'rehabilitation',
] as const
export type BadSignalKey = (typeof BAD_SIGNAL_KEYS)[number]

/** Ключ изменения, о котором пишем: плохие признаки + «снят с учёта по НДС». */
export type ChangeKey = BadSignalKey | 'vatLost'
export const CHANGE_KEYS: readonly ChangeKey[] = [...BAD_SIGNAL_KEYS, 'vatLost']

export interface WatchSignals {
  unreliable: Tri
  bankrupt: Tri
  liquidating: Tri
  registryClosed: Tri
  taxDebt: Tri
  enforcement: Tri
  rehabilitation: Tri
  /** true = плательщик НДС. false = не плательщик / снят. */
  vat: Tri
}

/** Агрегаты для текста письма и страницы. Без имён должников, судебных исполнителей и категорий взыскания. */
export interface WatchDetails {
  totalArrear: number | null
  enforcementCount: number | null
  enforcementActive: number | null
  unreliableCategories: UnreliableCategory[] | null
  status: string | null
  rehabSince: string | null
}

export interface WatchResult {
  signals: WatchSignals
  details: WatchDetails
}

export const EMPTY_SIGNALS: WatchSignals = {
  unreliable: null, bankrupt: null, liquidating: null, registryClosed: null,
  taxDebt: null, enforcement: null, rehabilitation: null, vat: null,
}

const CLOSED_STATUS = /ликвидир|прекращ|исключ/i

/** Признаки из ответа performBinLookup (с extras). Никакого «чисто» из null. */
export function extractResult(c: BinLookupResult): WatchResult {
  const cats = c.unreliableCategories ?? null
  // Банкротство - категория списка неблагонадёжных. Та же логика, что на странице
  // проверки: список не читался или причина не распознана -> не знаем.
  const bankrupt: Tri =
    c.isUnreliable === null || c.isUnreliable === undefined || cats === null ? null
    : cats.includes('bankrupt') ? true
    : c.isUnreliable === true && cats.length === 0 ? null
    : false
  const status = typeof c.status === 'string' && c.status.trim() ? c.status.trim() : null
  const enf = c.enforcement ?? null
  const rehab = c.rehabilitation ?? null // undefined (фича спит) = не проверено
  const arrear = typeof c.totalArrear === 'number' ? c.totalArrear : null
  return {
    signals: {
      unreliable: typeof c.isUnreliable === 'boolean' ? c.isUnreliable : null,
      bankrupt,
      liquidating: typeof c.isLiquidating === 'boolean' ? c.isLiquidating : null,
      registryClosed: status === null ? null : CLOSED_STATUS.test(status),
      taxDebt: arrear === null ? null : arrear > 0,
      enforcement: enf ? enf.found === true : null,
      rehabilitation: rehab ? (rehab.state === 'listed' ? true : rehab.state === 'not_listed' || rehab.state === 'terminated' ? false : null) : null,
      vat: typeof c.isVatPayer === 'boolean' ? c.isVatPayer : null,
    },
    details: {
      totalArrear: arrear,
      enforcementCount: enf ? enf.count : null,
      enforcementActive: enf ? enf.activeCount : null,
      unreliableCategories: cats,
      status,
      rehabSince: rehab && rehab.state === 'listed' && typeof rehab.since === 'string' ? rehab.since : null,
    },
  }
}

const isTri = (v: unknown): v is Tri => v === null || typeof v === 'boolean'

/** Сигналы из jsonb базы; любая странность в ключе = null для этого ключа, мусор целиком = null. */
export function parseSignals(raw: unknown): WatchSignals | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const out = { ...EMPTY_SIGNALS }
  for (const k of Object.keys(EMPTY_SIGNALS) as (keyof WatchSignals)[]) {
    const v = o[k]
    out[k] = isTri(v) ? v : null
  }
  return out
}

export function parseDetails(raw: unknown): WatchDetails {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const cats = Array.isArray(o.unreliableCategories)
    ? (o.unreliableCategories.filter(x => typeof x === 'string') as UnreliableCategory[])
    : null
  return {
    totalArrear: num(o.totalArrear),
    enforcementCount: num(o.enforcementCount),
    enforcementActive: num(o.enforcementActive),
    unreliableCategories: cats,
    status: typeof o.status === 'string' ? o.status.slice(0, 120) : null,
    rehabSince: typeof o.rehabSince === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.rehabSince) ? o.rehabSince : null,
  }
}

export interface Comparison {
  /** Новые негативные признаки; пусто, если ухудшения нет (или это первая проверка). */
  worsened: ChangeKey[]
  /** Что улучшилось: письма не вызывает, нужно только для учёта. */
  improved: ChangeKey[]
  /** Признаки, которые в этот раз не удалось проверить. */
  unchecked: (keyof WatchSignals)[]
}

/**
 * Сравнение новой проверки с базой. base === null: первая проверка, ничего не
 * ухудшилось по определению.
 */
export function compareSignals(base: WatchSignals | null, cur: WatchSignals): Comparison {
  const unchecked = (Object.keys(cur) as (keyof WatchSignals)[]).filter(k => cur[k] === null)
  if (!base) return { worsened: [], improved: [], unchecked }
  const worsened: ChangeKey[] = []
  const improved: ChangeKey[] = []
  for (const k of BAD_SIGNAL_KEYS) {
    // База хранит последнее ИЗВЕСТНОЕ значение (см. mergeBaseline), поэтому
    // base[k] === null значит «этот признак ни разу не удалось проверить с момента
    // добавления». Его первое успешное чтение - это отсчёт, а не новость: давняя
    // проблема, которую в первый день закрывал сбой реестра (Минюст часто даёт
    // 403), не должна приходить письмом «появилось». Письмо - только переход из
    // известного «нет» (false) в «есть».
    if (cur[k] === true && base[k] === false) worsened.push(k)
    else if (cur[k] === false && base[k] === true) improved.push(k)
  }
  if (base.vat === true && cur.vat === false) worsened.push('vatLost')
  else if (base.vat === false && cur.vat === true) improved.push('vatLost')
  return { worsened, improved, unchecked }
}

/** Новая база: свежее известное значение каждого признака, а при null остаётся прежнее. */
export function mergeBaseline(base: WatchSignals | null, cur: WatchSignals): WatchSignals {
  const out = { ...EMPTY_SIGNALS }
  for (const k of Object.keys(EMPTY_SIGNALS) as (keyof WatchSignals)[]) {
    out[k] = cur[k] ?? base?.[k] ?? null
  }
  return out
}

/** Ключи ожидающих писем, которые всё ещё актуальны по текущей базе (проблема могла пройти до отправки). */
export function stillActive(keys: readonly ChangeKey[], base: WatchSignals | null): ChangeKey[] {
  if (!base) return []
  return keys.filter(k => (k === 'vatLost' ? base.vat === false : base[k] === true))
}

/** Сводка для страницы: что плохо, что не проверено. */
export function summarize(result: WatchResult | null): { bad: ChangeKey[]; unchecked: (keyof WatchSignals)[]; clean: boolean } | null {
  if (!result) return null
  const bad: ChangeKey[] = BAD_SIGNAL_KEYS.filter(k => result.signals[k] === true)
  const unchecked = (Object.keys(result.signals) as (keyof WatchSignals)[]).filter(k => result.signals[k] === null)
  return { bad, unchecked, clean: bad.length === 0 && unchecked.length === 0 }
}
