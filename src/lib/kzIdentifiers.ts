// Проверка казахстанских идентификаторов на вводе — БИН/ИИН и ИИК (IBAN).
//
// Только математика, без сети и без справочников: годится и в браузере (форма
// показывает ошибку сразу), и на сервере (бонус за заполненный профиль
// перепроверяет то же самое по данным из базы, браузеру не доверяя).
//
// Банк по ИИК намеренно НЕ определяется: публичные таблицы кодов банков
// противоречат друг другу (решение основателя, см. kazakhstanBanks.ts).

/** Только цифры: пробелы, дефисы и прочее вокруг убираются. */
export function digitsOnly(input: string | null | undefined): string {
  return (input || '').replace(/\D/g, '')
}

const WEIGHTS_FIRST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const WEIGHTS_SECOND = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]

/**
 * Контрольный разряд БИН/ИИН (общий алгоритм для обоих).
 * Сумма первых 11 цифр с весами 1..11 по модулю 11; если вышло 10 — второй
 * проход с весами 3..11,1,2; если снова 10 — номер недействителен.
 * Возвращает ожидаемую 12-ю цифру или null, если такого номера быть не может.
 */
export function binControlDigit(first11: string): number | null {
  if (!/^\d{11}$/.test(first11)) return null
  const digits = first11.split('').map(Number)
  const sum = (weights: number[]) => digits.reduce((acc, d, i) => acc + d * weights[i], 0) % 11
  let control = sum(WEIGHTS_FIRST)
  if (control === 10) {
    control = sum(WEIGHTS_SECOND)
    if (control === 10) return null
  }
  return control
}

export type BinValidationError = 'empty' | 'length' | 'chars' | 'checksum'

/**
 * null — номер годится; иначе — что с ним не так.
 * «000000000000» математически сходится, но такого номера не бывает.
 */
export function validateBinIin(input: string | null | undefined): BinValidationError | null {
  const raw = (input || '').trim()
  if (!raw) return 'empty'
  // Буквы и прочие знаки — отдельная ошибка; разделители (пробел, точка,
  // дефис, слэш, запятая) просто убираются, как и в digitsOnly.
  if (/[^\d\s.\-\/,_]/.test(raw)) return 'chars'
  const value = digitsOnly(raw)
  if (value.length !== 12) return 'length'
  if (/^(\d)\1{11}$/.test(value)) return 'checksum'
  const control = binControlDigit(value.slice(0, 11))
  if (control === null || control !== Number(value[11])) return 'checksum'
  return null
}

export function isValidBinIin(input: string | null | undefined): boolean {
  return validateBinIin(input) === null
}

/** ИИК в том виде, в каком его хранить: без пробелов, заглавными. */
export function normalizeIik(input: string | null | undefined): string {
  return (input || '').replace(/\s+/g, '').toUpperCase()
}

/** Остаток IBAN по модулю 97 (у правильного номера он равен 1). */
export function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const chunk = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const c of chunk) remainder = (remainder * 10 + Number(c)) % 97
  }
  return remainder
}

export type IikValidationError = 'empty' | 'prefix' | 'length' | 'chars' | 'checksum'

/**
 * Казахстанский ИИК: «KZ» + 18 букв/цифр (всего 20) и контроль IBAN mod-97.
 * null — номер годится.
 */
export function validateIik(input: string | null | undefined): IikValidationError | null {
  const value = normalizeIik(input)
  if (!value) return 'empty'
  if (!value.startsWith('KZ')) return 'prefix'
  if (!/^[A-Z0-9]+$/.test(value)) return 'chars'
  if (value.length !== 20) return 'length'
  if (!/^KZ\d{2}[A-Z0-9]{16}$/.test(value)) return 'chars'
  if (ibanMod97(value) !== 1) return 'checksum'
  return null
}

export function isValidIik(input: string | null | undefined): boolean {
  return validateIik(input) === null
}
