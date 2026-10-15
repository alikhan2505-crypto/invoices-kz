// Проверка поля «След. номер» в /profile/settings.
//
// Номера выдают функции в базе: claim_invoice_number (счета) и
// claim_doc_number (КП/АВР/накладные). Обе берут из profiles текущее
// значение, отдают его как номер документа (префикс + число) и
// записывают в профиль следующее. Отсюда два правила:
//
// - только цифры: claim_invoice_number делает `invoice_next_number::int`,
//   и любая буква в поле ломает выпуск каждого следующего счёта;
// - не ниже уже выданного: если номер N с этим префиксом уже стоит на
//   документе, следующий не может быть N или меньше — иначе у двух
//   счетов окажется один номер.
//
// «Уже выданный» считается по самим документам (наибольший номер с тем же
// префиксом), а не по значению в профиле: человек, который по ошибке
// поставил 500 вместо 50, может вернуть 50, если 51–499 ещё никому не
// выдавались. И смена префикса начинает отсчёт заново, как и должна.

/** Больше 9 цифр не влезает в int, которым считают функции в базе. */
export const MAX_NEXT_NUMBER_DIGITS = 9

/** Для onChange: оставляет только цифры и обрезает до допустимой длины. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, MAX_NEXT_NUMBER_DIGITS)
}

/**
 * Наибольший номер среди уже выданных документов с этим префиксом;
 * 0, если таких нет. Номер считается «нашим», только если после префикса
 * идут одни цифры — `INV-12` с префиксом `INV-` даёт 12, а `INV-12-копия`
 * или номер с другим префиксом не учитываются.
 */
export function highestIssuedNumber(numbers: ReadonlyArray<string | null | undefined>, prefix: string): number {
  let max = 0
  for (const raw of numbers) {
    if (typeof raw !== 'string' || !raw.startsWith(prefix)) continue
    const rest = raw.slice(prefix.length)
    if (!/^\d+$/.test(rest)) continue
    const n = Number(rest)
    if (Number.isSafeInteger(n) && n > max) max = n
  }
  return max
}

export type NextNumberCheck =
  | { ok: true; value: string; numeric: number }
  | { ok: false; reason: 'empty' | 'not_digits' | 'too_long' | 'zero' }
  | { ok: false; reason: 'below_issued'; minimum: number }

/**
 * Проверяет введённый «След. номер». `value` в ответе — строка как ввели
 * (ведущие нули сохраняются: для счетов длина задаёт ширину номера,
 * `0001` → `0002`), `numeric` — то же число для целочисленных колонок.
 */
export function checkNextNumber(raw: string, highestIssued: number): NextNumberCheck {
  const value = raw.trim()
  if (!value) return { ok: false, reason: 'empty' }
  if (!/^\d+$/.test(value)) return { ok: false, reason: 'not_digits' }
  if (value.length > MAX_NEXT_NUMBER_DIGITS) return { ok: false, reason: 'too_long' }
  const numeric = Number(value)
  if (numeric < 1) return { ok: false, reason: 'zero' }
  if (numeric <= highestIssued) return { ok: false, reason: 'below_issued', minimum: highestIssued + 1 }
  return { ok: true, value, numeric }
}
