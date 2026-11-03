// Количество и цена в таблице позиций бесплатных документов (/tools/schet, avr,
// kp, nakladnaya): дробные значения («0,5 кг», «1 250,50 ₸»), запятая или точка.
// Раньше поля пропускали только цифры, и половину килограмма выписать было нельзя
// (аудит 02.11.2026). В состоянии формы значение по-прежнему строка — как в черновике
// localStorage, — поэтому здесь только чистые функции без React: их используют и
// calc.ts инструментов (в том числе на сервере, для блока «Образец»), и тесты.
import { tiynToNumber, toTiyn } from '@/lib/cfo/money'

/** Предел количества и цены — те же 6 и 10 цифр целой части, что были у полей с одними цифрами. */
export const QTY_MAX = 999_999
export const PRICE_MAX = 9_999_999_999
/** Знаков после запятой: цена - до тиына, количество - до грамма (0,001 кг). */
export const PRICE_DECIMALS = 2
export const QTY_DECIMALS = 3

/** Число из ячейки позиции: запятая или точка, пробелы (и неразрывные) не мешают; пусто или мусор = 0. */
export function rowNumber(raw: string | null | undefined): number {
  const n = Number(String(raw ?? '').replace(/[\s  ]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * Текст для состояния формы из числа, которое отдал DecimalField: ноль даёт пустую
 * ячейку (видна подсказка), а значение больше предела или отрицательное — null:
 * родитель его не принимает, и поле возвращает прежнее значение.
 */
export function rowCell(n: number, max: number, decimals: number = PRICE_DECIMALS): string | null {
  if (!(n >= 0) || n > max) return null
  // Лишние знаки не принимаются: документ печатает сумму до тиына, и цена 10,005 на экране
  // и в PDF округлялась бы по-разному; запись вроде 1e-7 в состояние формы тоже не попадёт.
  const scaled = n * 10 ** decimals
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) return null
  return n ? String(n) : ''
}

/** Количество для печати в документе: «0,5», а не «0.5» (суммы рядом печатаются с запятой). */
export function formatQty(n: number): string {
  return String(n).replace('.', ',')
}

/** Сумма до тиына: так её печатают документы (formatMoney с двумя знаками). */
export function roundTenge(n: number): number {
  return tiynToNumber(toTiyn(n))
}

/** «1 250 ₸» для целой суммы и «1 250,50 ₸», если в ней есть тиыны. */
export function formatTengeExact(n: number): string {
  const hasTiyn = toTiyn(n) % 100 !== 0
  const v = n.toLocaleString('ru-RU', hasTiyn
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 })
  return `${v} ₸`
}
