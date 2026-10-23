// КБе (код бенефициара) = 1 + цифра сектора экономики получателя.
// Резидент: ИП и физлицо — 19, ТОО (негосударственная нефинансовая
// организация) — 17. У АО и государственных форм код зависит от сектора
// (финансовые организации, госсектор и т. д.) — их не угадываем (решение
// основателя 23.10.2026: у АО другое значение, вводить вручную). Часть банков принимает для ИП на упрощёнке и 17, поэтому
// значение — только ПОДСКАЗКА: поле остаётся редактируемым, а пользователю
// говорим «проверьте по реквизитам вашего банка». Здесь нет ни сети, ни
// React — чистая функция, чтобы одинаково работать в бесплатном инструменте
// счёта, в «Мои банки» и в тестах.

/** ИП, КХ и физлицо. */
export const KBE_INDIVIDUAL = '19'
/** ТОО — негосударственная нефинансовая организация. */
export const KBE_COMPANY = '17'
/** Что стоит в поле, пока подсказать нечего (так было всегда). */
export const KBE_DEFAULT = KBE_INDIVIDUAL

export type LegalForm = 'individual' | 'company' | 'stock' | 'state'

type Phrase = readonly string[]

// Фразы записаны уже в нормальной форме (строчные, ё -> е, кириллица).
// Латиница — отдельно: 'ip', 'llp', 'jsc' и английские названия.
const INDIVIDUAL: Phrase[] = [
  ['ип'], ['жк'], ['кх'], ['фх'], ['кфх'], ['ip'],
  ['индивидуальный', 'предприниматель'],
  ['жеке', 'кәсіпкер'], ['жеке', 'кәсіпкері'],
  ['крестьянское', 'хозяйство'], ['фермерское', 'хозяйство'],
  ['крестьянское', 'или', 'фермерское', 'хозяйство'],
  ['шаруа', 'қожалығы'], ['фермер', 'қожалығы'], ['шаруа', 'немесе', 'фермер', 'қожалығы'],
  ['физическое', 'лицо'], ['жеке', 'тұлға'],
  ['individual', 'entrepreneur'],
]

const COMPANY: Phrase[] = [
  ['тоо'], ['жшс'], ['llp'],
  ['товарищество'], ['серіктестік'], ['серіктестігі'],
  ['жауапкершілігі', 'шектеулі'],
  ['limited', 'liability'],
]

// Акционерные общества: КБе зависит от сектора (банки, страховые, госкомпании
// — другой код), поэтому форму узнаём, но код не подставляем.
const STOCK: Phrase[] = [
  ['ао'], ['нао'], ['ақ'], ['jsc'],
  ['акционерное', 'общество'], ['акционерлік', 'қоғам'],
  ['joint', 'stock'],
]

// Государственные формы: у них КБе из другого сектора (11, 12 и т. д.), и
// гадать нельзя — null, поле остаётся как есть.
const STATE: Phrase[] = [
  ['гу'], ['кгу'], ['ргу'], ['гкп'], ['кгп'], ['ргп'], ['гккп'], ['кгкп'], ['ккп'],
  ['государственное'], ['государственный'],
  ['республиканское', 'государственное'], ['коммунальное', 'государственное'],
  ['мемлекеттік'], ['коммуналдық', 'мемлекеттік'], ['республикалық', 'мемлекеттік'],
]

const FORMS: Array<[LegalForm, Phrase[]]> = [
  ['state', STATE],
  ['stock', STOCK],
  ['individual', INDIVIDUAL],
  ['company', COMPANY],
]

// Латинские двойники кириллицы: «ТOО» с латинской O на клавиатуре — частое дело.
const LATIN_TO_CYR: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
}
const HAS_CYR = /[а-яёәіңғүұқөһ]/i
const HAS_LATIN = /[a-z]/i

function normalizeToken(raw: string): string {
  let t = raw.toLowerCase().replace(/ё/g, 'е')
  if (HAS_CYR.test(t)) {
    // «Ақ» — обычное слово («белый», Ақ Жол); АҚ — форма, только заглавными.
    if (t === 'ақ' && raw !== 'АҚ') return 'ақ.'
    // Слово со смесью алфавитов — латинские двойники читаем как кириллицу.
    if (HAS_LATIN.test(t)) t = t.replace(/[a-z]/g, ch => LATIN_TO_CYR[ch] ?? ch)
    return t
  }
  // Чисто латинское слово: «TOO» заглавными — это ТОО, а «Too Good» — нет.
  if (raw === 'TOO') return 'тоо'
  return t
}

/**
 * Название -> слова. Точки в начальной аббревиатуре («И.П.», «Т.О.О.»; в конце
 * названия это инициалы человека, «Петров А.О.») и скобки в «К(Ф)Х» склеиваем
 * до разбиения, остальное (кавычки, дефисы,
 * скобки) — просто разделители. Совпадение идёт по целым словам, поэтому
 * «Тоотекс» или «Ипподром» формой не считаются.
 */
function tokenize(name: string): string[] {
  const glued = name
    .replace(/(?<=\p{L})\(([\p{L}])\)(?=\p{L})/gu, '$1')
    .replace(/^([^\p{L}\p{N}]*)((?:\p{L}\.){2,3})/u, (_m, pre: string, abbr: string) => pre + abbr.replace(/\./g, ''))
  return glued
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(normalizeToken)
}

const startsWith = (tokens: string[], phrase: Phrase) =>
  tokens.length >= phrase.length && phrase.every((w, i) => tokens[i] === w)
const endsWith = (tokens: string[], phrase: Phrase) =>
  tokens.length >= phrase.length && phrase.every((w, i) => tokens[tokens.length - phrase.length + i] === w)

/**
 * Организационно-правовая форма по названию: в начале («ТОО «Альфа»») или в
 * конце (««Альфа» ТОО»). null — форму не узнали, угадывать не будем.
 */
export function detectLegalForm(name: string | null | undefined): LegalForm | null {
  const tokens = tokenize(String(name ?? ''))
  if (tokens.length === 0) return null
  for (const match of [startsWith, endsWith]) {
    for (const [form, phrases] of FORMS) {
      if (phrases.some(p => match(tokens, p))) return form
    }
  }
  return null
}

/**
 * Похоже ли значение на ИИН (физлицо/ИП): 12 цифр, ГГММДД + признак века и
 * пола 1-6. У БИН юрлица пятая цифра 4-6, поэтому БИН сюда не попадает.
 */
export function isIinLike(value: string | null | undefined): boolean {
  const d = String(value ?? '').replace(/\D/g, '')
  if (d.length !== 12) return false
  const month = Number(d.slice(2, 4))
  return month >= 1 && month <= 12 && /[0-3]/.test(d[4]) && /[1-6]/.test(d[6])
}

export type KbeSuggestInput = string | { name?: string | null; bin?: string | null } | null | undefined

/**
 * Какой КБе подставить: '19' — ИП/КХ/физлицо, '17' — ТОО, null — не знаем
 * (АО, государственные формы, неизвестное название). Название главнее ИИН; пока
 * названия нет или форма в нём не опознана, ИИН-подобный номер даёт '19'.
 * null значит «оставить текущее значение» — вызывающий сам решает, какое.
 */
export function suggestKbe(input: KbeSuggestInput): string | null {
  const name = typeof input === 'string' ? input : input?.name
  const bin = typeof input === 'string' ? null : input?.bin
  const form = detectLegalForm(name)
  if (form === 'state' || form === 'stock') return null
  if (form === 'individual') return KBE_INDIVIDUAL
  if (form === 'company') return KBE_COMPANY
  return isIinLike(bin) ? KBE_INDIVIDUAL : null
}

/**
 * Форма опознана, но код зависит от сектора (АО, госформы): человеку нужно
 * ввести КБе вручную по реквизитам банка — UI показывает усиленную подсказку.
 */
export function needsManualKbe(input: KbeSuggestInput): boolean {
  const name = typeof input === 'string' ? input : input?.name
  const form = detectLegalForm(name)
  return form === 'stock' || form === 'state'
}

/**
 * Поле КБе, пока человек его не трогал, следует за подсказкой; нечего
 * подсказать — стоит обычное '19'.
 */
export function autoKbe(input: KbeSuggestInput): string {
  return suggestKbe(input) ?? KBE_DEFAULT
}

/**
 * Считать ли КБе из черновика выставленным вручную. Флаг пишется явно в обоих
 * состояниях: '1' — человек правил поле, '0' — поле следует за подсказкой (иначе
 * автоподставленное 17 после перезагрузки выглядело бы введённым руками). Только
 * если флага нет вовсе (черновик до этой версии), '19' неотличимо от значения по
 * умолчанию, а любое другое значение человек вводил сам.
 */
export function isDraftKbeManual(flag: unknown, kbe: unknown): boolean {
  if (flag === '1') return true
  if (flag === '0') return false
  const v = String(kbe ?? '').trim()
  return v !== '' && v !== KBE_DEFAULT
}
