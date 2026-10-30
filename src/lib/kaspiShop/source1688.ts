// «Найти на 1688» на карточках раздела «Ниши» (30.10.2026, этап 0). Чистая часть без сети и
// React: кодировка запроса для 1688, разбор ответа модели, плашки рисков, ссылка в калькулятор
// маржи. Сам перевод названия на китайский (Anthropic) живёт в source1688Llm.ts, маршрут в
// /api/kaspi-shop/niches/source-1688.
//
// Этап 0 ничего не берёт с 1688: он только открывает поиск 1688 в новой вкладке с готовым
// китайским запросом и подставляет цену Kaspi и оценку веса в калькулятор. Автоматический режим
// (цены и поставщики из API) подключается позже поверх, когда будет ключ провайдера
// (см. память «1688 в Нишах»): условия 1688 и посредников запрещают передавать данные третьим
// лицам, поэтому показ чужой выдачи тысячам продавцов нужно сначала согласовать с юристом.

/**
 * Админ-гейт (правило основателя: каждую новую секцию он лично проверяет до открытия
 * клиентам). true: кнопка и маршрут доступны ТОЛЬКО is_admin. Открыть всем = поменять на
 * false ЗДЕСЬ, больше нигде.
 */
export const SOURCE_1688_ADMIN_ONLY = true

export function canUseSource1688(isAdmin: boolean | null | undefined): boolean {
  return SOURCE_1688_ADMIN_ONLY ? isAdmin === true : true
}

// ---- кодировка для s.1688.com ----

// 1688 принимает ключевые слова в кодировке GBK (UTF-8 даёт кракозябры или пустую выдачу).
// Таблица «символ -> %XX%XX» строится один раз из декодера GBK самого рантайма: так не нужен
// ни пакет iconv, ни вручную набранная таблица.
let gbkTable: Map<string, string> | null = null

const hex = (n: number) => `%${n.toString(16).toUpperCase().padStart(2, '0')}`

function table(): Map<string, string> {
  if (gbkTable) return gbkTable
  const m = new Map<string, string>()
  const dec = new TextDecoder('gbk')
  for (let hi = 0x81; hi <= 0xfe; hi++) {
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo === 0x7f) continue
      const ch = dec.decode(new Uint8Array([hi, lo]))
      if (ch.length === 1 && ch !== '�' && !m.has(ch)) m.set(ch, hex(hi) + hex(lo))
    }
  }
  gbkTable = m
  return m
}

/** Строка в процентной кодировке GBK. null, если в ней есть символ, которого нет в GBK. */
export function encodeGbkQuery(text: string): string | null {
  const t = table()
  let out = ''
  for (const ch of text) {
    if (/^[A-Za-z0-9\-_.~]$/.test(ch)) out += ch
    else if (ch === ' ') out += '%20'
    else {
      const code = t.get(ch)
      if (code === undefined) return null
      out += code
    }
  }
  return out
}

/** Ссылка на поиск 1688 по китайскому запросу. Без GBK-кодировки откатывается на UTF-8. */
export function build1688SearchUrl(zhQuery: string): string {
  const q = zhQuery.trim()
  const gbk = encodeGbkQuery(q)
  return `https://s.1688.com/selloffer/offer_search.htm?keywords=${gbk ?? encodeURIComponent(q)}`
}

// ---- ответ модели ----

export interface Source1688Query {
  /** Китайский поисковый запрос. */
  zh: string
  /** Что он значит по-русски (для глаза продавца). */
  ru: string
}

export interface Source1688Suggestion {
  queries: Source1688Query[]
  /** Оценка веса одной единицы в граммах: НЕ факт, продавец поправляет. null = модель не взялась. */
  weightGrams: number | null
}

const HAN = /[一-鿿]/

/**
 * Разбор ответа модели в формате JSON: {"queries":[{"zh":"..","ru":".."}], "weightGrams": 123}.
 * Берёт JSON из любого места ответа (модель может добавить слова вокруг). Отбрасывает запросы
 * без иероглифов, слишком длинные и дубли; максимум три запроса. null, если полезного нет.
 */
export function parseSuggestion(raw: unknown): Source1688Suggestion | null {
  if (typeof raw !== 'string') return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let data: unknown
  try { data = JSON.parse(raw.slice(start, end + 1)) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const d = data as { queries?: unknown; weightGrams?: unknown }
  if (!Array.isArray(d.queries)) return null

  const seen = new Set<string>()
  const queries: Source1688Query[] = []
  for (const item of d.queries) {
    if (!item || typeof item !== 'object') continue
    const { zh, ru } = item as { zh?: unknown; ru?: unknown }
    if (typeof zh !== 'string') continue
    const z = zh.trim()
    if (!z || z.length > 40 || !HAN.test(z) || seen.has(z)) continue
    seen.add(z)
    queries.push({ zh: z, ru: typeof ru === 'string' ? ru.trim().slice(0, 120) : '' })
    if (queries.length === 3) break
  }
  if (queries.length === 0) return null

  const w = Number(d.weightGrams)
  const weightGrams = Number.isFinite(w) && w >= 1 && w <= 50_000 ? Math.round(w) : null
  return { queries, weightGrams }
}

// ---- плашки рисков ----

export interface Source1688Risk {
  key: 'brand' | 'documents' | 'duty'
  text: string
}

const DOCUMENT_CATEGORIES: { re: RegExp; label: string }[] = [
  { re: /(детск|ребён|ребен|малыш|новорожд|подгузн|игрушк|соск)/i, label: 'детские товары' },
  { re: /(витамин|бад(?![а-яё])|лекарств|аптек|мазь|таблетк)/i, label: 'аптека и БАДы' },
  { re: /(крем|космет|шампун|помад|духи|парфюм|маск[аи] для (лица|волос)|лосьон)/i, label: 'косметика и парфюмерия' },
  { re: /(золот|серебр|ювелир|кольц|серьг|браслет|кулон)/i, label: 'украшения' },
  { re: /(футболк|плать|куртк|штаны|брюки|джинс|одежд|кофт|толстовк|носк|колготк)/i, label: 'одежда и текстиль' },
  { re: /(зарядк|аккумулятор|power ?bank|наушник|роутер|лампа|светильник|кабель|розетк)/i, label: 'электроника' },
]

/**
 * Что надо знать продавцу до заказа. Это подсказки по ключевым словам в названии, а не
 * юридическое заключение: для брендовых товаров нужны документы на закупку, для ряда категорий
 * сертификаты и маркировка, а пошлина и НДС при ввозе в калькуляторе маржи не учтены.
 */
export function risksFor(name: string, brand?: string | null): Source1688Risk[] {
  const out: Source1688Risk[] = []
  const b = (brand ?? '').trim()
  if (b && !/^(без бренда|no brand|noname|нет|-)$/i.test(b)) {
    out.push({ key: 'brand', text: `Бренд «${b}»: оригинал с 1688 обычно не продают, а копии нельзя продавать на Kaspi. Ищите товары без бренда.` })
  }
  const cat = DOCUMENT_CATEGORIES.find(c => c.re.test(name))
  if (cat) {
    out.push({ key: 'documents', text: `Категория «${cat.label}»: для продажи на Kaspi могут понадобиться сертификаты и маркировка. Проверьте до заказа.` })
  }
  out.push({ key: 'duty', text: 'Калькулятор маржи не учитывает пошлину и НДС при ввозе (НДС 16%, пошлина по коду ТН ВЭД): добавьте их к закупке.' })
  return out
}

// ---- калькулятор маржи ----

/** Ссылка в калькулятор маржи с подставленными названием, ценой Kaspi и оценкой веса. */
export function marginHref(p: { name: string; price: number; weightGrams: number | null }): string {
  const q = new URLSearchParams()
  q.set('name', p.name.slice(0, 120))
  if (Number.isFinite(p.price) && p.price > 0) q.set('price', String(Math.round(p.price)))
  if (p.weightGrams) q.set('weight', String(p.weightGrams))
  return `/kaspi-shop/margin?${q.toString()}`
}

/** Что калькулятор читает из адреса. Только положительные числа и короткое название. */
export function readMarginPrefill(search: string): { name: string; price: string; weight: string } {
  const q = new URLSearchParams(search)
  const num = (k: string) => {
    const n = Number(q.get(k))
    return Number.isFinite(n) && n > 0 && n < 100_000_000 ? String(Math.round(n)) : ''
  }
  return { name: (q.get('name') ?? '').trim().slice(0, 120), price: num('price'), weight: num('weight') }
}

/** Нормализованное название для кэша: регистр, пробелы, спецсимволы. */
export function cacheKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 160)
}
