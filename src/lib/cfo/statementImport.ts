// Импорт банковской выписки в журнал. Всё здесь — чистые функции над «сеткой»
// ячеек (строки × колонки), чтобы формат любого банка разбирался одинаково:
// сначала угадываем колонки по заголовкам, человек может поправить, потом
// строки превращаются в черновики операций. Чтение самого файла — в readGrid.
import type { CfoAccount, CfoArticle, CfoOperation, Direction } from './types'
import { isIsoDate } from './dates'
import { MAX_AMOUNT_TIYN } from './money'

export type Cell = string | number | boolean | null | undefined
export type Grid = Cell[][]

export type ColumnMap = {
  date: number
  amount: number // знаковая сумма: минус — списание
  debit: number // списание (расход)
  credit: number // поступление (приход)
  counterparty: number
  purpose: number
}

export const NO_COLUMN = -1
export const MAX_IMPORT_ROWS = 2000
const HEADER_SCAN_ROWS = 30

const norm = (c: Cell) => String(c ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

const DATE_HEADERS = ['дата операции', 'дата проводки', 'дата платежа', 'дата документа', 'дата']
const DEBIT_HEADERS = ['дебет', 'списание', 'расход', 'исходящ', 'сумма списания']
const CREDIT_HEADERS = ['кредит', 'поступлени', 'зачислени', 'приход', 'входящ']
const AMOUNT_HEADERS = ['сумма', 'amount']
const COUNTERPARTY_HEADERS = ['контрагент', 'корреспондент', 'получатель', 'отправитель', 'плательщик', 'бенефициар', 'наименование']
const PURPOSE_HEADERS = ['назначение', 'детали', 'описание', 'комментарий', 'details']

function findHeader(row: Cell[], words: string[], taken: Set<number>): number {
  // Сначала точное совпадение, потом «содержит» — «Дата» не должна съесть «Дата валютирования» раньше «Дата операции».
  for (const w of words) {
    const i = row.findIndex((c, idx) => !taken.has(idx) && norm(c) === w)
    if (i !== -1) return i
  }
  for (const w of words) {
    const i = row.findIndex((c, idx) => !taken.has(idx) && norm(c).includes(w))
    if (i !== -1) return i
  }
  return NO_COLUMN
}

// Строка заголовка — первая, где нашлась дата и хоть какая-то сумма.
export function detectColumns(grid: Grid): { headerRow: number; map: ColumnMap } | null {
  for (let r = 0; r < Math.min(grid.length, HEADER_SCAN_ROWS); r++) {
    const row = grid[r] ?? []
    const taken = new Set<number>()
    const pick = (words: string[]) => {
      const i = findHeader(row, words, taken)
      if (i !== NO_COLUMN) taken.add(i)
      return i
    }
    const date = pick(DATE_HEADERS)
    if (date === NO_COLUMN) continue
    const debit = pick(DEBIT_HEADERS)
    const credit = pick(CREDIT_HEADERS)
    const amount = debit !== NO_COLUMN && credit !== NO_COLUMN ? NO_COLUMN : pick(AMOUNT_HEADERS)
    if (amount === NO_COLUMN && (debit === NO_COLUMN || credit === NO_COLUMN)) continue
    const purpose = pick(PURPOSE_HEADERS)
    const counterparty = pick(COUNTERPARTY_HEADERS)
    return { headerRow: r, map: { date, amount, debit: amount === NO_COLUMN ? debit : NO_COLUMN, credit: amount === NO_COLUMN ? credit : NO_COLUMN, counterparty, purpose } }
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

// Excel хранит дату числом дней от 30.12.1899; строки бывают ДД.ММ.ГГГГ (с временем), ГГГГ-ММ-ДД, ДД/ММ/ГГГГ.
export function parseCellDate(c: Cell): string | null {
  if (typeof c === 'number' && c > 20000 && c < 80000) {
    const ms = Math.round((c - 25569) * 86400000) // 25569 = 01.01.1970
    const d = new Date(ms)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const s = String(c ?? '').trim()
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(\D|$)/)
  if (m) return valid(`${m[3]}-${pad(+m[2])}-${pad(+m[1])}`)
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})(\D|$)/)
  if (m) return valid(`20${m[3]}-${pad(+m[2])}-${pad(+m[1])}`)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`)
  return null
}
const valid = (iso: string) => (isIsoDate(iso) ? iso : null)

// Сумма из ячейки в тиынах со знаком. Понимает «1 250 000,50», «-1250000.50», «(500)», «−300 ₸», «1,250,000.50».
export function parseCellMoney(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? Math.round(c * 100) : null
  let s = String(c ?? '').trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  s = s.replace(/[\s  ]/g, '').replace(/(₸|kzt|тг\.?|тенге)/gi, '')
  if (/^[-−–]/.test(s)) { negative = !negative; s = s.slice(1) }
  if (s.startsWith('+')) s = s.slice(1)
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '') // 1,250,000.50
  else s = s.replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const t = Math.round(Number(s) * 100)
  return negative ? -t : t
}

export type ParsedRow = {
  line: number // номер строки в файле, с 1 — чтобы человек нашёл её в Excel
  date: string
  direction: 'in' | 'out'
  amount: number
  counterparty: string
  purpose: string
}

export function extractRows(grid: Grid, headerRow: number, map: ColumnMap): ParsedRow[] {
  const out: ParsedRow[] = []
  const text = (row: Cell[], i: number) => (i === NO_COLUMN ? '' : String(row[i] ?? '').replace(/\s+/g, ' ').trim())
  for (let r = headerRow + 1; r < grid.length && out.length < MAX_IMPORT_ROWS; r++) {
    const row = grid[r] ?? []
    const date = parseCellDate(row[map.date])
    if (!date) continue // итоги, подписи, пустые строки
    let signed: number | null = null
    if (map.amount !== NO_COLUMN) {
      signed = parseCellMoney(row[map.amount])
    } else {
      const credit = map.credit === NO_COLUMN ? null : parseCellMoney(row[map.credit])
      const debit = map.debit === NO_COLUMN ? null : parseCellMoney(row[map.debit])
      if (credit) signed = Math.abs(credit)
      else if (debit) signed = -Math.abs(debit)
    }
    if (!signed) continue
    out.push({
      line: r + 1,
      date,
      direction: signed > 0 ? 'in' : 'out',
      amount: Math.abs(signed),
      counterparty: text(row, map.counterparty),
      purpose: text(row, map.purpose),
    })
  }
  return out
}

// ── Разнесение по статьям ─────────────────────────────────────────────────

export type Choice = { kind: 'article'; articleId: string } | { kind: 'transfer'; otherAccountId: string } | { kind: 'none' }

// Без \b: в JS без флага u граница слова не видит кириллицу — делим на слова пробелами.
const LEGAL_FORMS = new Set(['тоо', 'ип', 'ао', 'ооо', 'llp', 'кх'])
const normParty = (s: string) => s.toLowerCase().replace(/["«»'`.,]/g, ' ').split(/\s+/).filter((w) => w && !LEGAL_FORMS.has(w)).join(' ')

// Ключевые слова → начало названия стартовой статьи. Подсказка срабатывает,
// только если у человека есть статья с таким названием и нужного вида.
const KEYWORDS: { words: RegExp; article: string; kind: 'income' | 'expense' }[] = [
  { words: /комисси|эквайр|обслуживани[ея] сч/i, article: 'банковские комиссии', kind: 'expense' },
  { words: /аренд/i, article: 'аренда', kind: 'expense' },
  { words: /заработн|зарплат|з\/п/i, article: 'зарплата', kind: 'expense' },
  { words: /(^|[^а-яё])(опв|опвр|восмс|осмс|ипн)([^а-яё]|$)|социальн/i, article: 'налоги и взносы с зарплаты', kind: 'expense' },
  { words: /ндс/i, article: 'ндс к уплате', kind: 'expense' },
  { words: /кпн|налог на доход|упрощ/i, article: 'налог на доход', kind: 'expense' },
  { words: /коммунальн|электроэнерг|водоснаб|отоплени/i, article: 'коммунальные услуги', kind: 'expense' },
  { words: /интернет|связ|мобильн/i, article: 'связь и интернет', kind: 'expense' },
  { words: /реклам|таргет|маркетинг/i, article: 'реклама и маркетинг', kind: 'expense' },
  { words: /погашени.*(основн|тел)|основной долг/i, article: 'погашение тела кредита', kind: 'expense' },
  { words: /вознагражд|процент/i, article: 'проценты по кредитам', kind: 'expense' },
  { words: /оплат.*(за товар|по счет|по договор)|за услуг|kaspi pay|продаж/i, article: 'выручка от', kind: 'income' },
]

export function suggestChoice(row: ParsedRow, history: CfoOperation[], articles: CfoArticle[]): Choice {
  const kind = row.direction === 'in' ? 'income' : 'expense'
  const live = articles.filter((a) => !a.archived && a.kind === kind)
  // 1. Тот же контрагент уже разносился — берём последнюю его статью.
  const party = normParty(row.counterparty)
  if (party) {
    const prev = history
      .filter((o) => o.direction === row.direction && o.articleId && o.counterparty && normParty(o.counterparty) === party)
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn))
      .find((o) => live.some((a) => a.id === o.articleId))
    if (prev?.articleId) return { kind: 'article', articleId: prev.articleId }
  }
  // 2. Ключевые слова в назначении.
  const textToCheck = `${row.purpose} ${row.counterparty}`
  for (const k of KEYWORDS) {
    if (k.kind !== kind || !k.words.test(textToCheck)) continue
    const a = live.find((x) => x.name.toLowerCase().startsWith(k.article))
    if (a) return { kind: 'article', articleId: a.id }
  }
  // 3. «Прочие …» нужного вида, иначе — человек выберет сам.
  const other = live.find((a) => a.name.toLowerCase().startsWith('прочие'))
  return other ? { kind: 'article', articleId: other.id } : { kind: 'none' }
}

// ── Дубли и проверки ───────────────────────────────────────────────────────

// Строка — дубль, если на этом счёте уже есть фактическая операция с той же
// датой, суммой и направлением (переводы считаются с обеих сторон). Одинаковые
// строки в самой выписке гасят существующие по одной — две покупки по 500 ₸
// в один день не склеиваются в одну.
export function markDuplicates(rows: ParsedRow[], accountId: string, ops: CfoOperation[]): Set<number> {
  const pool = new Map<string, number>()
  const key = (date: string, dir: 'in' | 'out', amount: number) => `${date}|${dir}|${amount}`
  for (const o of ops) {
    if (o.status !== 'actual') continue
    let dir: 'in' | 'out' | null = null
    if (o.direction !== 'transfer' && o.accountId === accountId) dir = o.direction
    else if (o.direction === 'transfer' && o.accountId === accountId) dir = 'out'
    else if (o.direction === 'transfer' && o.toAccountId === accountId) dir = 'in'
    if (!dir) continue
    const k = key(o.paidOn, dir, o.amount)
    pool.set(k, (pool.get(k) ?? 0) + 1)
  }
  const dup = new Set<number>()
  for (const r of rows) {
    const k = key(r.date, r.direction, r.amount)
    const left = pool.get(k) ?? 0
    if (left > 0) { dup.add(r.line); pool.set(k, left - 1) }
  }
  return dup
}

export type ImportDraft = {
  direction: Direction
  amount: number
  accountId: string
  toAccountId: string | null
  articleId: string | null
  paidOn: string
  accruedOn: string
  status: 'actual'
  counterparty: string | null
  comment: string | null
}

export function rowProblem(row: ParsedRow, account: CfoAccount, today: string): string | null {
  if (row.date > today) return 'дата в будущем'
  if (row.date < account.openingDate) return 'раньше начала учёта по счёту'
  if (row.amount > MAX_AMOUNT_TIYN) return 'слишком большая сумма'
  return null
}

export function toDraft(row: ParsedRow, accountId: string, choice: Choice): ImportDraft | null {
  const base = { amount: row.amount, paidOn: row.date, accruedOn: row.date, status: 'actual' as const, counterparty: row.counterparty.slice(0, 200) || null, comment: row.purpose.slice(0, 500) || null }
  if (choice.kind === 'article') return { ...base, direction: row.direction, accountId, toAccountId: null, articleId: choice.articleId }
  if (choice.kind === 'transfer') {
    // Списание с этого счёта на другой свой — перевод отсюда; поступление — перевод оттуда сюда.
    return row.direction === 'out'
      ? { ...base, direction: 'transfer', accountId, toAccountId: choice.otherAccountId, articleId: null }
      : { ...base, direction: 'transfer', accountId: choice.otherAccountId, toAccountId: accountId, articleId: null }
  }
  return null
}
