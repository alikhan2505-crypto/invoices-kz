// Сумма прописью по-русски для счёта, накладной и других документов.
// До 23.10.2026 в generatePDF.ts и generateNakladnaya.ts жили две копии с одной
// ошибкой: тысячи от 10 и миллионы писались без склонения («двадцать один
// тысяч», «восемьдесят четыре тысяч», «два миллионов»). Теперь одна функция.

const ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

/** Слово в нужной форме для числа: [1, 2–4, 5–20 и т. д.], например тысяча/тысячи/тысяч. */
function plural(n: number, forms: [string, string, string]): string {
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 19) return forms[2]
  const m10 = n % 10
  if (m10 === 1) return forms[0]
  if (m10 >= 2 && m10 <= 4) return forms[1]
  return forms[2]
}

/** Число от 1 до 999 прописью; feminine — для «тысяча» (одна, две). */
function triad(n: number, feminine: boolean): string {
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const o = n % 10
  const parts: string[] = []
  if (h > 0) parts.push(HUNDREDS[h])
  if (t === 1) parts.push(TEENS[o])
  else {
    if (t > 1) parts.push(TENS[t])
    if (o > 0) parts.push((feminine ? ONES_F : ONES_M)[o])
  }
  return parts.join(' ')
}

const GROUPS: Array<{ forms: [string, string, string]; feminine: boolean }> = [
  { forms: ['тысяча', 'тысячи', 'тысяч'], feminine: true },
  { forms: ['миллион', 'миллиона', 'миллионов'], feminine: false },
  { forms: ['миллиард', 'миллиарда', 'миллиардов'], feminine: false },
  { forms: ['триллион', 'триллиона', 'триллионов'], feminine: false },
]

/** Целое число прописью: 21000 → «двадцать одна тысяча», 2000000 → «два миллиона». */
export function numberToWordsRu(value: number): string {
  if (!Number.isFinite(Number(value))) return ''
  let n = Math.floor(Math.abs(Number(value)))
  if (n === 0) return 'ноль'
  const parts: string[] = []
  let group = -1 // -1 — единицы, 0 — тысячи, 1 — миллионы …
  while (n > 0 && group < GROUPS.length) {
    const chunk = n % 1000
    n = Math.floor(n / 1000)
    if (chunk > 0) {
      if (group === -1) parts.unshift(triad(chunk, false))
      else parts.unshift(`${triad(chunk, GROUPS[group].feminine)} ${plural(chunk, GROUPS[group].forms)}`)
    }
    group++
  }
  const words = parts.join(' ')
  return Number(value) < 0 ? 'минус ' + words : words
}

/** «сто сорок девять тысяч четыреста тенге 50 тиын» — тиыны из дробной части. */
export function amountInWordsKzt(total: number): string {
  const abs = Math.abs(Number(total) || 0)
  let tenge = Math.floor(abs)
  let tiyn = Math.round((abs - tenge) * 100)
  if (tiyn === 100) { tenge += 1; tiyn = 0 }
  const words = numberToWordsRu(Number(total) < 0 ? -tenge : tenge)
  return `${words} тенге ${String(tiyn).padStart(2, '0')} тиын`
}
