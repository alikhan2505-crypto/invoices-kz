import type { AvrDict } from './dict'

// Чистая логика /tools/avr (без React) — чтобы итог на экране и итог в самом
// акте считались одинаково и это можно было проверить тестом. generateAVR
// берёт в документ строки как есть и сам пересчитывает сумму как
// Σ qty × price, а НДС 16% выделяет из итога как round(total − total / 1.16).
// Здесь — то же самое, плюс в документ идут только строки с наименованием.

export type VatType = 'no_vat' | 'vat_16' | 'vat_0'

export type Row = { name: string; qty: string; price: string }

export type Form = {
  companyName: string; binIin: string; address: string; director: string; phone: string
  clientName: string; clientBin: string; clientAddress: string
  number: string; date: string; contractNumber: string; contractDate: string
  vatType: VatType
  rows: Row[]
}

export const VAT_TYPES: VatType[] = ['no_vat', 'vat_16', 'vat_0']

export const digits = (s: string) => s.replace(/\D/g, '')

/**
 * Сегодняшняя дата по часам посетителя, YYYY-MM-DD. Не toISOString(): та даёт
 * дату по UTC, и в Казахстане (UTC+5) с полуночи до 05:00 подставляла бы
 * вчерашнее число в акт и сбрасывала дневной лимит не в полночь.
 */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** «2026-10-14» → «14.10.2026» — так дата печатается в акте. */
export function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

/** Строки, которые попадут в документ: только с наименованием. */
export function documentRows(rows: Row[]) {
  return rows
    .filter(r => r.name.trim())
    .map(r => ({ name: r.name.trim(), qty: Number(r.qty) || 0, price: Number(r.price) || 0 }))
}

/** Итог ровно как в документе: Σ qty × price по строкам с наименованием. */
export function documentTotal(rows: Row[]): number {
  return documentRows(rows).reduce((sum, r) => sum + r.qty * r.price, 0)
}

/** НДС 16% «в т. ч.» — та же формула, что в generateAVR. */
export function vatIncluded(total: number, vatType: VatType): number {
  return vatType === 'vat_16' ? Math.round(total - total / 1.16) : 0
}

/** Первая найденная ошибка формы — уже текстом на языке страницы, или ''. */
export function validateForm(f: Form, e: AvrDict['errors']): string {
  if (!f.companyName.trim()) return e.company
  if (digits(f.binIin).length !== 12) return e.bin
  if (!f.clientName.trim()) return e.client
  if (f.clientBin && digits(f.clientBin).length !== 12) return e.clientBin
  // Строка с ценой, но без наименования в акт не попадёт — лучше сказать об
  // этом, чем молча выкинуть её из итога.
  for (let i = 0; i < f.rows.length; i++) {
    const r = f.rows[i]
    if (!r.name.trim() && Number(r.price) > 0) return e.rowName(i + 1)
  }
  const rows = documentRows(f.rows)
  if (rows.length === 0) return e.noRows
  // Раньше пустое количество уходило в акт как 1, а итог на экране считал 0 —
  // экран и документ расходились. Теперь такую строку просим заполнить.
  for (const r of rows) {
    if (r.qty < 1) return e.rowQty(r.name)
    if (r.price <= 0) return e.rowPrice(r.name)
  }
  if (documentTotal(f.rows) <= 0) return e.zero
  return ''
}
