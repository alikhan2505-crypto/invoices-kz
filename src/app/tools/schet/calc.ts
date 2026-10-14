import { KAZAKHSTAN_BANKS, OTHER_BANK } from '@/lib/kazakhstanBanks'
import type { SchetDict } from './dict'

// Чистая логика /tools/schet (без React) — чтобы итог на экране и итог в
// самом счёте считались одинаково и это можно было проверить тестом.
// generateInvoicePDF печатает переданные строки (qty × price) и берёт сумму
// прописью и НДС из переданного total, поэтому total обязан считаться ровно по
// тем строкам, что уйдут в документ. НДС 16% generateInvoicePDF выделяет из
// итога как round(total − total / 1.16). Здесь — то же самое.

export type VatType = 'no_vat' | 'vat_16' | 'vat_0'

export const VAT_TYPES: VatType[] = ['no_vat', 'vat_16', 'vat_0']

export type Row = { name: string; qty: string; unit?: string; price: string }

export type Form = {
  companyName: string; binIin: string; address: string; director: string; phone: string
  bankBik: string; otherBankName: string; otherBankBik: string; iik: string; kbe: string
  clientName: string; clientBin: string
  number: string; date: string; dueDate: string
  vatType: VatType
  note: string
  rows: Row[]
}

export const digits = (s: string) => s.replace(/\D/g, '')

/**
 * Сегодняшняя дата по часам посетителя, YYYY-MM-DD. Не toISOString(): та даёт
 * дату по UTC, и в Казахстане (UTC+5) с полуночи до 05:00 подставляла бы
 * вчерашнее число в счёт и сбрасывала дневной лимит не в полночь.
 */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** «2026-10-14» → «14.10.2026» — так дата печатается в счёте. */
export function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

/** Банк, который попадёт в счёт: из справочника по БИК или введённый вручную. */
export function resolveBank(f: Pick<Form, 'bankBik' | 'otherBankName' | 'otherBankBik'>): { name: string; bik: string } {
  if (f.bankBik === OTHER_BANK) return { name: f.otherBankName.trim(), bik: f.otherBankBik.trim().toUpperCase() }
  const b = KAZAKHSTAN_BANKS.find(b => b.bik === f.bankBik)
  return b ? { name: b.name, bik: b.bik } : { name: '', bik: '' }
}

/** Строки, которые попадут в документ: только с наименованием. */
export function documentRows(rows: Row[]) {
  return rows
    .filter(r => r.name.trim())
    .map(r => ({ name: r.name.trim(), qty: Number(r.qty) || 0, unit: r.unit || 'шт', price: Number(r.price) || 0 }))
}

/** Итог ровно как в документе: Σ qty × price по строкам с наименованием. */
export function documentTotal(rows: Row[]): number {
  return documentRows(rows).reduce((sum, r) => sum + r.qty * r.price, 0)
}

/** НДС 16% «в т. ч.» — та же формула, что в generateInvoicePDF. */
export function vatIncluded(total: number, vatType: VatType): number {
  return vatType === 'vat_16' ? Math.round(total - total / 1.16) : 0
}

/** Первая найденная ошибка формы — уже текстом на языке страницы, или ''. */
export function validateForm(f: Form, e: SchetDict['errors']): string {
  const bank = resolveBank(f)
  if (!f.companyName.trim()) return e.company
  if (digits(f.binIin).length !== 12) return e.bin
  // Банк и БИК обязательны (правило основателя): без них клиент не сможет
  // отправить платёж. БИК — 8 символов SWIFT, буквы и цифры.
  if (!bank.name || bank.bik.length !== 8) return e.bank
  if (f.iik.trim().length < 20) return e.iik
  if (!f.clientName.trim()) return e.client
  if (digits(f.clientBin).length !== 12) return e.clientBin
  // Строка с ценой, но без наименования в документ не попадёт — лучше
  // сказать об этом, чем молча выкинуть её из итога.
  for (let i = 0; i < f.rows.length; i++) {
    const r = f.rows[i]
    if (!r.name.trim() && Number(r.price) > 0) return e.rowName(i + 1)
  }
  const rows = documentRows(f.rows)
  if (rows.length === 0) return e.noRows
  for (const r of rows) {
    if (r.qty < 1) return e.rowQty(r.name)
    if (r.price <= 0) return e.rowPrice(r.name)
  }
  if (documentTotal(f.rows) <= 0) return e.zero
  return ''
}
