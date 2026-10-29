// Запоминание реквизитов ПОСТАВЩИКА в браузере для бесплатных документов /tools
// (schet, avr, kp, nakladnaya, 29.10.2026): один ключ localStorage на все четыре
// инструмента, подставляется в ПУСТЫЕ поля при следующем документе. Никуда не
// отправляется. Данные покупателя и позиции здесь не хранятся никогда.
// Каждое чтение и запись - в try/catch: в приватном режиме и при отключённых
// данных сайта localStorage бросает, форма должна работать и без него.

export const REQUISITES_KEY = 'tools-supplier-requisites'

/** Ключи черновиков четырёх инструментов (по ним «Очистить» убирает и реквизиты). */
export const TOOL_DRAFT_KEYS = [
  'tool-schet-draft', 'tool-avr-draft', 'tool-kp-draft', 'tool-nakladnaya-draft',
] as const
/** Счёт хранит отдельно флаг «КБе правили руками» - он же относится к реквизитам. */
export const KBE_MANUAL_KEY = 'tool-schet-kbe-manual'

export const REQUISITE_KEYS = [
  'binIin', 'companyName', 'address', 'director', 'phone', 'email',
  'bankBik', 'otherBankName', 'otherBankBik', 'iik', 'kbe',
] as const
export type RequisiteKey = (typeof REQUISITE_KEYS)[number]
export type Requisites = Partial<Record<RequisiteKey, string>>

const MAX_LEN = 200

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, MAX_LEN)
  return s || null
}

/** Сырой JSON → только известные ключи со строковыми значениями (чужие данные не доверяем). */
export function parseRequisites(raw: string | null): Requisites {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Requisites = {}
    for (const k of REQUISITE_KEYS) {
      const s = clean((v as Record<string, unknown>)[k])
      if (s) out[k] = s
    }
    return out
  } catch {
    return {}
  }
}

export function loadRequisites(): Requisites {
  try { return parseRequisites(window.localStorage.getItem(REQUISITES_KEY)) } catch { return {} }
}

export const hasRequisites = (r: Requisites): boolean => Object.keys(r).length > 0

/** Из формы - только перечисленные ключи (у инструмента нет поля - ключа нет, чужое не затираем). */
export function pickRequisites(form: Partial<Record<RequisiteKey, string>>, keys: readonly RequisiteKey[]): Requisites {
  const out: Requisites = {}
  for (const k of keys) out[k] = typeof form[k] === 'string' ? (form[k] as string) : ''
  return out
}

const binDigits = (v: unknown): string => String(v ?? '').replace(/\D/g, '')
const nameKey = (v: unknown): string => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Относится ли сохранённое к тому же юрлицу, что стоит в форме. Реквизиты поставщика
 * - один набор: адрес и руководитель от фирмы Б не должны лечь к БИН и названию
 * фирмы А (бухгалтер с несколькими клиентами, черновики не истекают). Решает БИН
 * формы, а если его нет - название; пустая форма подходит любому сохранённому.
 */
export function requisitesMatch(form: Partial<Record<RequisiteKey, string>>, saved: Requisites): boolean {
  const fb = binDigits(form.binIin)
  const sb = binDigits(saved.binIin)
  if (fb) return !sb || fb === sb
  const fn = nameKey(form.companyName)
  const sn = nameKey(saved.companyName)
  return !fn || !sn || fn === sn
}

/**
 * Склеить уже сохранённое с новым срезом формы. Пустое значение в срезе стирает
 * ключ (человек очистил поле), ключи, которых в срезе нет, остаются как были.
 * Исключение: в срезе другой БИН (человек перешёл на другую фирму) - старое не
 * переносим, иначе у инструмента без поля телефона остался бы телефон прежней фирмы.
 */
export function mergeRequisites(prev: Requisites, picked: Requisites): Requisites {
  const pb = binDigits(picked.binIin)
  const base = pb && binDigits(prev.binIin) && pb !== binDigits(prev.binIin) ? {} : prev
  const next: Requisites = { ...base }
  for (const k of REQUISITE_KEYS) {
    if (!(k in picked)) continue
    const s = clean(picked[k])
    if (s) next[k] = s
    else delete next[k]
  }
  return next
}

/** Записать срез (слияние с уже сохранённым). false - хранилище недоступно. */
export function saveRequisites(picked: Requisites): boolean {
  try {
    const next = mergeRequisites(loadRequisites(), picked)
    if (!hasRequisites(next)) { window.localStorage.removeItem(REQUISITES_KEY); return true }
    window.localStorage.setItem(REQUISITES_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

/**
 * Подставить сохранённое в ПУСТЫЕ поля формы (введённое или пришедшее из черновика
 * не трогаем). Только если сохранённое относится к тому же юрлицу (requisitesMatch):
 * черновик фирмы А не дополняем адресом фирмы Б. Возвращает новую форму и список
 * подставленных ключей.
 */
export function applyRequisites<F extends Partial<Record<RequisiteKey, string>>>(
  form: F, saved: Requisites, keys: readonly RequisiteKey[],
): { form: F; applied: RequisiteKey[] } {
  const next = { ...form }
  const applied: RequisiteKey[] = []
  if (!requisitesMatch(form, saved)) return { form: next, applied }
  for (const k of keys) {
    const s = saved[k]
    if (!s) continue
    if (String(form[k] ?? '').trim() !== '') continue
    ;(next as Record<string, unknown>)[k] = s
    applied.push(k)
  }
  return { form: next, applied }
}

/**
 * «Очистить сохранённые реквизиты»: общий ключ уходит, а из черновиков всех четырёх
 * инструментов вычищаются поля поставщика (иначе перезагрузка вернула бы их из черновика).
 * Остальное в черновиках (клиент, позиции, номер) не трогаем.
 */
export function clearRequisites(): boolean {
  let ok = true
  try { window.localStorage.removeItem(REQUISITES_KEY) } catch { ok = false }
  try { window.localStorage.removeItem(KBE_MANUAL_KEY) } catch { ok = false }
  for (const key of TOOL_DRAFT_KEYS) {
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const draft = JSON.parse(raw)
      if (!draft || typeof draft !== 'object' || Array.isArray(draft)) continue
      for (const k of REQUISITE_KEYS) if (k in draft) draft[k] = k === 'kbe' ? '19' : ''
      window.localStorage.setItem(key, JSON.stringify(draft))
    } catch { ok = false }
  }
  return ok
}
