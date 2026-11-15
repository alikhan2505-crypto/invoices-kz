import { TOOL_UNITS } from './units'

// Перенос клиента и позиций из одного бесплатного документа в другой (15.11.2026):
// сделал счёт, нажал «Составить акт», и в акте уже стоят тот же клиент, те же
// позиции и тот же НДС. Реквизиты поставщика переносить не надо: они и так
// общие для четырёх инструментов (requisites.ts).
//
// Хранилище: sessionStorage, а не localStorage. Данные покупателя и позиции
// намеренно не лежат в браузере постоянно (requisites.ts), здесь они живут
// только до закрытия вкладки и не дольше 15 минут. Записываются ТОЛЬКО в момент
// клика по кнопке «Составить …», читаются один раз на странице получателя.
// Каждое обращение к хранилищу в try/catch (приватный режим, отключённые данные).

export type DocTool = 'avr' | 'kp' | 'schet' | 'nakladnaya'

/** Что предлагаем после документа. КП ведёт к счёту, счёт к акту (услуги) и накладной (товары). */
export const DOC_NEXT: Record<DocTool, readonly DocTool[]> = {
  kp: ['schet'],
  schet: ['avr', 'nakladnaya'],
  avr: ['schet'],
  nakladnaya: ['schet'],
}

export const HANDOFF_KEY = 'tool-doc-handoff'
export const HANDOFF_TTL_MS = 15 * 60 * 1000
const MAX_ROWS = 50
const MAX_TEXT = 300
const VAT_TYPES = ['no_vat', 'vat_16', 'vat_0'] as const
type VatType = (typeof VAT_TYPES)[number]

export interface HandoffRow { name: string; qty: string; unit: string; price: string }

export interface DocHandoff {
  from: DocTool
  to: DocTool
  at: number
  clientName: string
  clientBin: string
  clientAddress: string
  vatType: VatType
  rows: HandoffRow[]
}

/** Страница инструмента на языке посетителя: русская без префикса, остальные с /kk или /en. */
export function toolPagePath(tool: DocTool, lang: 'ru' | 'kk' | 'en'): string {
  return lang === 'ru' ? `/tools/${tool}` : `/tools/${lang}/${tool}`
}

const text = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? v.slice(0, max) : '')
const isTool = (v: unknown): v is DocTool => v === 'avr' || v === 'kp' || v === 'schet' || v === 'nakladnaya'

/** Из формы источника: только нужные поля, позиции без пустых строк. Пустой клиент и пустые позиции не переносим. */
export function buildHandoff(
  from: DocTool,
  to: DocTool,
  form: { clientName?: string; clientBin?: string; clientAddress?: string; vatType?: string; rows?: Array<{ name?: string; qty?: string; unit?: string; price?: string }> },
  now = Date.now(),
): DocHandoff {
  const rows: HandoffRow[] = []
  for (const r of form.rows ?? []) {
    const name = text(r?.name, 200).trim()
    if (!name || rows.length >= MAX_ROWS) continue
    const unit = typeof r.unit === 'string' && (TOOL_UNITS as readonly string[]).includes(r.unit) ? r.unit : ''
    rows.push({ name, qty: text(r.qty, 20), unit, price: text(r.price, 20) })
  }
  const vat = form.vatType as VatType
  return {
    from, to, at: now,
    clientName: text(form.clientName).trim(),
    clientBin: text(form.clientBin, 20).trim(),
    clientAddress: text(form.clientAddress).trim(),
    vatType: (VAT_TYPES as readonly string[]).includes(vat) ? vat : 'no_vat',
    rows,
  }
}

/** Сырое значение хранилища в безопасный объект или null (чужие и просроченные данные не берём). */
export function parseHandoff(raw: string | null, now = Date.now()): DocHandoff | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    if (!v || typeof v !== 'object' || !isTool(v.from) || !isTool(v.to)) return null
    const at = typeof v.at === 'number' ? v.at : 0
    if (!(now - at >= 0 && now - at <= HANDOFF_TTL_MS)) return null
    const rows = Array.isArray(v.rows) ? v.rows : []
    const built = buildHandoff(v.from, v.to, {
      clientName: text(v.clientName), clientBin: text(v.clientBin, 20), clientAddress: text(v.clientAddress),
      vatType: typeof v.vatType === 'string' ? v.vatType : '',
      rows: rows.map(r => (r && typeof r === 'object' ? (r as Record<string, string>) : {})),
    }, at)
    return built
  } catch {
    return null
  }
}

export function saveHandoff(h: DocHandoff): boolean {
  try { window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(h)); return true } catch { return false }
}

// В dev React запускает эффект монтирования дважды: без запоминания второй запуск
// не нашёл бы удалённую запись и затёр бы перенесённое черновиком.
let memo: { to: DocTool; value: DocHandoff | null } | null = null

/** Прочитать перенос для этого инструмента один раз и удалить запись из хранилища. */
export function consumeHandoff(to: DocTool): DocHandoff | null {
  if (memo && memo.to === to) return memo.value
  let value: DocHandoff | null = null
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY)
    const h = parseHandoff(raw)
    if (h && h.to === to) {
      value = h
      window.sessionStorage.removeItem(HANDOFF_KEY)
    }
  } catch { /* хранилище недоступно: просто без переноса */ }
  memo = { to, value }
  return value
}

/** Только для тестов: сбросить запоминание. */
export function resetHandoffMemo() { memo = null }

/** Кладёт клиента, НДС и позиции в форму получателя; без переноса возвращает форму как есть. */
export function mergeHandoff<F extends { clientName: string; clientBin: string; vatType: string; rows: Array<{ name: string; qty: string; unit?: string; price: string }> }>(
  form: F,
  h: DocHandoff | null,
): { form: F; applied: boolean } {
  if (!h || (!h.clientName && h.rows.length === 0)) return { form, applied: false }
  const next: F = { ...form, clientName: h.clientName, clientBin: h.clientBin, vatType: h.vatType }
  if ('clientAddress' in form) (next as unknown as { clientAddress: string }).clientAddress = h.clientAddress
  if (h.rows.length > 0) next.rows = h.rows.map(r => ({ name: r.name, qty: r.qty || '1', unit: r.unit || 'шт', price: r.price }))
  return { form: next, applied: true }
}
