import type { NakladnayaDict } from './dict'
import { roundTenge, rowNumber } from '@/lib/tools-i18n/rowNumbers'

// Чистая логика /tools/nakladnaya (без React) — чтобы итог на экране и итог в
// самой накладной считались одинаково и это можно было проверить тестом.
// generateNakladnaya берёт в документ только строки с наименованием и сам
// пересчитывает сумму как Σ qty × price, а НДС 16% выделяет из итога как
// round(total − total / 1.16). Здесь — то же самое.

export type VatType = 'no_vat' | 'vat_16' | 'vat_0'

export type Row = { name: string; qty: string; unit?: string; price: string }

export type Form = {
  companyName: string; binIin: string; address: string; director: string
  /** Email продавца для рассылки invoices.kz (только с галочкой согласия) — в документ НЕ печатается. */
  email: string
  clientName: string; clientBin: string
  number: string; date: string
  vatType: VatType
  rows: Row[]
}

export const digits = (s: string) => s.replace(/\D/g, '')

/**
 * Сегодняшняя дата по часам посетителя, YYYY-MM-DD. Не toISOString(): та даёт
 * дату по UTC, и в Казахстане (UTC+5) с полуночи до 05:00 подставляла бы
 * вчерашнее число в накладную и сбрасывала дневной лимит не в полночь.
 */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** «2026-10-14» → «14.10.2026» — так дата печатается в накладной. */
export function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

/** Строки, которые попадут в документ: только с наименованием. */
export function documentRows(rows: Row[]) {
  return rows
    .filter(r => r.name.trim())
    .map(r => ({ name: r.name.trim(), qty: rowNumber(r.qty), unit: r.unit || 'шт', price: rowNumber(r.price) }))
}

/** Итог ровно как в документе: Σ qty × price по строкам с наименованием, до тиына (количество и цена бывают дробными). */
export function documentTotal(rows: Row[]): number {
  return roundTenge(documentRows(rows).reduce((sum, r) => sum + r.qty * r.price, 0))
}

/** НДС 16% «в т. ч.» — та же формула, что в generateNakladnaya. */
export function vatIncluded(total: number, vatType: VatType): number {
  return vatType === 'vat_16' ? Math.round(total - total / 1.16) : 0
}

/** Первая найденная ошибка формы — уже текстом на языке страницы, или ''. */
export function validateForm(f: Form, e: NakladnayaDict['errors']): string {
  if (!f.companyName.trim()) return e.company
  if (digits(f.binIin).length !== 12) return e.bin
  if (!f.clientName.trim()) return e.client
  if (f.clientBin && digits(f.clientBin).length !== 12) return e.clientBin
  // Строка с ценой или количеством, но без наименования в документ не
  // попадёт — лучше сказать об этом, чем молча выкинуть её из итога.
  for (let i = 0; i < f.rows.length; i++) {
    const r = f.rows[i]
    if (!r.name.trim() && rowNumber(r.price) > 0) return e.rowName(i + 1)
  }
  const rows = documentRows(f.rows)
  if (rows.length === 0) return e.noRows
  // Номер строки, а не название: название вводит пользователь, а текст ошибки остаётся на
  // экране (и в записи сессии PostHog).
  for (let i = 0; i < f.rows.length; i++) {
    if (!f.rows[i].name.trim()) continue
    const r = documentRows([f.rows[i]])[0]
    if (r.qty <= 0) return e.rowQty(i + 1)
    if (r.price <= 0) return e.rowPrice(i + 1)
  }
  if (documentTotal(f.rows) <= 0) return e.zero
  return ''
}
