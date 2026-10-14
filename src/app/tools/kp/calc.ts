// Чистая арифметика /tools/kp — отдельно от компонента, чтобы её можно было
// проверить тестом. Главное правило: сумма на экране и сумма в документе
// считаются из ОДНОГО набора строк. Раньше «Итого» на странице брало все
// строки (в том числе без названия), а в КП попадали только строки с
// названием, да ещё с количеством «1» вместо пустого — суммы расходились.

export type KpRow = { name: string; qty: string; unit?: string; price: string }

export interface KpLine { name: string; qty: number; unit: string; price: number }

/** Единицы измерения строки КП (правка основателя 14.10.2026). Значение —
 *  русское сокращение: оно печатается в документе, который всегда русский;
 *  подписи в списке на kk/en — в dict.ts (unitLabels). Список продукта
 *  (/create) плюс «т», «компл.», «упак.» — для стройматериалов и опта. */
export const KP_UNITS = ['шт', 'кг', 'т', 'л', 'м', 'м²', 'м³', 'компл.', 'упак.', 'час', 'день', 'месяц', 'услуга', 'работа'] as const
export const KP_DEFAULT_UNIT = 'шт'

const num = (s: string) => Number(s) || 0

/** Строки, которые попадут в документ: только с названием. */
export function kpLines(rows: KpRow[]): KpLine[] {
  return rows
    .filter(r => r.name.trim())
    .map(r => ({ name: r.name.trim(), qty: num(r.qty), unit: r.unit || KP_DEFAULT_UNIT, price: num(r.price) }))
}

/** Итог — ровно по тем строкам, что уйдут в документ (qty × price, как в generateKP). */
export function kpTotal(rows: KpRow[]): number {
  return kpLines(rows).reduce((sum, l) => sum + l.qty * l.price, 0)
}

/**
 * НДС «в том числе» при цене с НДС 16% — та же формула, что печатает
 * generateKP (Math.round(total - total / 1.16)), чтобы цифра на странице
 * совпадала с цифрой в КП до тенге.
 */
export function kpVatIncluded(total: number): number {
  return Math.round(total - total / 1.16)
}

export type KpRowProblem =
  | { kind: 'noRows' }
  | { kind: 'rowName'; n: number }
  | { kind: 'rowQty'; n: number }

/**
 * Проблемы со строками (номер — человеческий, с 1):
 *  - строка с ценой или количеством > 1, но без названия — в документ не
 *    попадёт, а человек думает, что попадёт;
 *  - строка с названием, но с пустым/нулевым количеством.
 * Пустые строки (как добавили и не заполнили) молча пропускаются.
 */
export function kpRowProblem(rows: KpRow[]): KpRowProblem | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const named = !!r.name.trim()
    if (!named && (num(r.price) > 0 || num(r.qty) > 1)) return { kind: 'rowName', n: i + 1 }
    if (named && num(r.qty) <= 0) return { kind: 'rowQty', n: i + 1 }
  }
  return kpLines(rows).length === 0 ? { kind: 'noRows' } : null
}

/** Сегодняшняя дата по часам посетителя (а не по UTC) в виде YYYY-MM-DD. */
export function localIsoDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** «2026-10-14» → «14.10.2026» — так дата печатается в КП. */
export function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}
