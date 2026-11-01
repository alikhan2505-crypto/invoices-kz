// Поиск товаров у поставщиков на Made-in-China.com для «Найти на 1688» (31.10.2026, этап 1).
// 1688 и Alibaba.com отдают серверу капчу, обходить её мы не будем. Made-in-China.com отдаёт
// обычную страницу поиска без капчи. Их robots.txt не запрещает /products-search/hot-china-products/
// для обычных роботов (группа «*»; именованным ИИ-ботам там отдельное явное разрешение, которое к нам
// не относится), Crawl-delay нет. Страница содержит и структурированные данные schema.org (JSON-LD),
// и обычные карточки. Берём из них:
//  - JSON-LD ItemList: название, фото, поставщик, верхняя граница цены (она совпала с карточкой в
//    22 из 22 случаев; нижняя граница в JSON-LD часто неверна, в 14 из 22 случаев на проверке);
//  - карточки (блок id="product-divN" с cz-id товара): точный диапазон цены, минимальная партия и
//    её единица, ссылка на товар по его id. Карточка принимается только если её верхняя цена сходится
//    с JSON-LD; иначе остаёмся на данных JSON-LD и честно показываем «до $X».
//
// Цены Made-in-China экспортные (FOB, в долларах, без доставки, пошлины и НДС), на 1688 тот же товар
// обычно дешевле. УСЛОВИЯ САЙТА (https://www.made-in-china.com/help/terms/, раздел V.3) без письменного
// согласия запрещают копировать, цитировать и использовать их информацию, а II.3(5) запрещает сбор
// сведений о других пользователях. Поэтому функция остаётся админ-only (source1688.ts), и перед
// открытием продавцам нужно письменное разрешение Made-in-China (или другой источник).
//
// Вежливость: запросы не чаще раза в 2 секунды с экземпляра (очередь), честный User-Agent,
// ответ живёт 6 часов в памяти, после серии сбоев пауза. Любой сбой или незнакомая форма даёт
// status:'unavailable', а не «ничего не нашлось». Выключатель без деплоя: MIC_SEARCH_DISABLED=1.

export interface MicItem {
  name: string
  imageUrl: string
  supplier: string
  category: string
  /** Диапазон цены в долларах: lowUsd <= highUsd. */
  lowUsd: number
  highUsd: number
  /**
   * true: диапазон точный (из карточки или единственная цена). false: надёжна только верхняя
   * граница, lowUsd равен highUsd, показывать как «до $X».
   */
  rangeVerified: boolean
  /** Минимальная партия из карточки (число и единица в её написании, «Bags», «Pieces»). */
  moqQty: number | null
  moqUnit: string | null
  /** Ссылка на карточку товара, если нашли её на странице; иначе ссылка на выдачу. */
  url: string
  /** true: url ведёт на сам товар. */
  exact: boolean
}

export type MicResult =
  | { status: 'ok'; searchUrl: string; items: MicItem[] }
  | { status: 'unavailable'; searchUrl: string }

const SEARCH_BASE = 'https://www.made-in-china.com/products-search/hot-china-products/'
const IMAGE_PREFIX = 'https://image.made-in-china.com/'
const PRODUCT_LINK = /href="(https:\/\/[a-z0-9-]+\.en\.made-in-china\.com\/product\/[A-Za-z0-9]+\/[^"\s]+\.html)"/g

export const MIC_MAX_ITEMS = 12
const MAX_PER_SUPPLIER = 3

/** Адрес выдачи по английскому запросу. null, если в запросе нет латинских слов. */
export function micSearchUrl(query: string): string | null {
  const words = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 5)
  if (words.length === 0) return null
  const slug = words.map(w => w[0].toUpperCase() + w.slice(1)).join('_')
  if (slug.length > 60) return null
  return `${SEARCH_BASE}${slug}.html`
}

const decodeEntities = (s: string): string =>
  s.replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const slugOf = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Цена: положительное разумное число или null. */
function usd(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null
}

interface Card {
  link: string | null
  low: number | null
  high: number | null
  moqQty: number | null
  moqUnit: string | null
}

/** Карточки выдачи по номеру позиции (id="product-divN"). Любой непонятный блок просто пропускается. */
function parseCards(html: string): Map<number, Card> {
  const cards = new Map<number, Card>()
  for (const part of html.split(/(?=<div[^>]*\bid="product-div\d+")/)) {
    const n = /\bid="product-div(\d+)"/.exec(part)
    const pid = /\bcz-id="([A-Za-z0-9]+)"/.exec(part)
    if (!n || !pid) continue
    const link = new RegExp(`href="(https://[a-z0-9-]+\\.en\\.made-in-china\\.com/product/${pid[1]}/[^"\\s]+\\.html)"`).exec(part)
    const priceHtml = /<strong class="price">([\s\S]*?)<\/strong>/.exec(part)
    const nums = priceHtml
      ? (priceHtml[1].replace(/<[^>]+>/g, ' ').match(/\d[\d,]*\.?\d*/g) ?? []).map(t => usd(t.replace(/,/g, ''))).filter((x): x is number => x !== null)
      : []
    const moq = /<span\s+class="attribute">\s*<span>\s*([\d,]+)\s*([^<]*?)\s*<\/span>\s*<\/span>\s*<span class="moq-text">/.exec(part)
    const qty = moq ? Number(moq[1].replace(/,/g, '')) : NaN
    const unit = moq ? moq[2].trim() : ''
    cards.set(Number(n[1]), {
      link: link ? link[1] : null,
      low: nums.length ? Math.min(...nums.slice(0, 2)) : null,
      high: nums.length ? Math.max(...nums.slice(0, 2)) : null,
      moqQty: Number.isFinite(qty) && qty > 0 && qty < 1e9 ? qty : null,
      moqUnit: /^[A-Za-z][A-Za-z .]{0,19}$/.test(unit) ? unit : null,
    })
  }
  return cards
}

/**
 * Разбор страницы выдачи. null: форма незнакомая (нет ни списка товаров, ни фразы «ничего не
 * найдено», либо список есть, а ни один товар не разобран), то есть «не знаем», а не «пусто».
 * [] допустим только при явной фразе сайта.
 */
export function parseMicSearch(html: unknown, searchUrl: string): MicItem[] | null {
  if (typeof html !== 'string' || html.length < 1000) return null

  let list: unknown[] | null = null
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown
    try { data = JSON.parse(m[1]) } catch { continue }
    for (const block of Array.isArray(data) ? data : [data]) {
      const b = block as { '@type'?: unknown; itemListElement?: unknown }
      if (b && b['@type'] === 'ItemList' && Array.isArray(b.itemListElement)) list = b.itemListElement
    }
  }
  if (!list) return /No matches were found for/i.test(html) ? [] : null
  if (list.length === 0) return []

  const cards = parseCards(html)
  // Запасная привязка ссылки по названию, если карточку не нашли. Сайт ставит перед названием «China-».
  const links = new Map<string, string>()
  for (const m of html.matchAll(PRODUCT_LINK)) {
    const slug = slugOf(m[1].slice(m[1].lastIndexOf('/') + 1, -5)).replace(/^china-/, '')
    if (!links.has(slug)) links.set(slug, m[1])
  }

  const items: MicItem[] = []
  const names = new Set<string>()
  const perSupplier = new Map<string, number>()
  list.forEach((el, index) => {
    if (items.length >= MIC_MAX_ITEMS) return
    const p = (el as { item?: Record<string, unknown> } | null)?.item
    if (!p || p['@type'] !== 'Product') return
    const offers = p.offers as { '@type'?: unknown; lowPrice?: unknown; highPrice?: unknown; price?: unknown; seller?: { name?: unknown } } | undefined
    const nums = [usd(offers?.lowPrice), usd(offers?.highPrice), usd(offers?.price)].filter((x): x is number => x !== null)
    const name = typeof p.name === 'string' ? decodeEntities(p.name).trim() : ''
    const image = typeof p.image === 'string' ? p.image : ''
    if (nums.length === 0 || name.length < 3 || name.length > 300) return
    if (!image.startsWith(IMAGE_PREFIX) || /\s/.test(image) || image.length > 600) return

    const key = slugOf(name)
    if (names.has(key)) return
    const supplier = typeof offers?.seller?.name === 'string' ? decodeEntities(offers.seller.name).trim().slice(0, 120) : ''
    const used = perSupplier.get(supplier) ?? 0
    if (supplier && used >= MAX_PER_SUPPLIER) return

    const jsonHigh = Math.max(...nums)
    const position = Number((el as { position?: unknown }).position)
    const card = cards.get(Number.isInteger(position) && position > 0 ? position : index + 1)
    // Карточка той же позиции принимается, только если её верхняя цена сходится с JSON-LD (1%).
    const cardOk = !!card && card.high !== null && Math.abs(card.high - jsonHigh) <= jsonHigh * 0.01
    const fixedPrice = offers?.lowPrice === undefined && offers?.highPrice === undefined && offers?.price !== undefined
    const link = (cardOk ? card!.link : null) ?? links.get(key.replace(/^china-/, '')) ?? null

    names.add(key)
    perSupplier.set(supplier, used + 1)
    items.push({
      name,
      imageUrl: image,
      supplier,
      category: typeof p.category === 'string' ? decodeEntities(p.category).trim().slice(0, 80) : '',
      lowUsd: cardOk ? Math.min(card!.low ?? jsonHigh, jsonHigh) : jsonHigh,
      highUsd: jsonHigh,
      rangeVerified: cardOk || fixedPrice,
      moqQty: cardOk ? card!.moqQty : null,
      moqUnit: cardOk ? card!.moqUnit : null,
      url: link ?? searchUrl,
      exact: !!link,
    })
  })
  // Список есть, а ни один товар не разобрали: форма изменилась, это «не знаем», а не «пусто».
  return items.length === 0 ? null : items
}

// ---- ответ для интерфейса ----

export interface SupplierCard extends MicItem {
  /** Цена в тенге по курсу Нацбанка; null, если курс не получили. */
  lowKzt: number | null
  highKzt: number | null
}

export interface SuppliersPayload {
  source: 'made-in-china'
  query: string
  searchUrl: string
  status: 'ok' | 'unavailable'
  /** Курс Нацбанка, ₸ за 1 доллар; null, если не получили (цены только в долларах). */
  usdKzt: number | null
  items: SupplierCard[]
}

export function presentSuppliers(mic: MicResult, query: string, usdKzt: number | null): SuppliersPayload {
  const rate = usdKzt !== null && Number.isFinite(usdKzt) && usdKzt > 0 ? usdKzt : null
  const items: SupplierCard[] = mic.status === 'ok'
    ? mic.items.map(i => ({
      ...i,
      lowKzt: rate === null ? null : Math.round(i.lowUsd * rate),
      highKzt: rate === null ? null : Math.round(i.highUsd * rate),
    }))
    : []
  return { source: 'made-in-china', query, searchUrl: mic.searchUrl, status: mic.status, usdKzt: rate, items }
}

// ---- сеть ----

const TIMEOUT_MS = 8_000
const MIN_INTERVAL_MS = 2_000
const MAX_WAIT_MS = 6_000
const MAX_BYTES = 3_000_000
const RESULT_TTL_MS = 6 * 3_600_000
const RESULT_CACHE_MAX = 200
const BREAKER_FAILURES = 3
const BREAKER_PAUSE_MS = 60_000

let consecutiveFailures = 0
let breakerOpenUntil = 0
let nextSlotAt = 0
const cache = new Map<string, { at: number; value: MicResult }>()

/** Только для тестов. */
export function resetMicState(): void {
  consecutiveFailures = 0
  breakerOpenUntil = 0
  nextSlotAt = 0
  cache.clear()
}

export function micDisabled(): boolean {
  return process.env.MIC_SEARCH_DISABLED === '1'
}

function minInterval(): number {
  const raw = process.env.MIC_MIN_INTERVAL_MS
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 60_000) return n
  }
  return MIN_INTERVAL_MS
}

function record(ok: boolean): void {
  if (ok) { consecutiveFailures = 0; return }
  consecutiveFailures += 1
  if (consecutiveFailures >= BREAKER_FAILURES) {
    breakerOpenUntil = Date.now() + BREAKER_PAUSE_MS
    consecutiveFailures = 0
  }
}

/**
 * Поиск по английскому запросу. null: запрос непригоден или выключатель включён (секцию не
 * показываем). Иначе всегда результат: сбой даёт status:'unavailable'. Успешный ответ кэшируется
 * на 6 часов, сбои не кэшируются.
 */
export async function fetchMic(query: string): Promise<MicResult | null> {
  const searchUrl = micSearchUrl(query)
  if (!searchUrl || micDisabled()) return null
  const unavailable: MicResult = { status: 'unavailable', searchUrl }

  const hit = cache.get(searchUrl)
  if (hit) {
    if (Date.now() - hit.at < RESULT_TTL_MS) return hit.value
    cache.delete(searchUrl)
  }
  if (Date.now() < breakerOpenUntil) return unavailable

  const interval = minInterval()
  const now = Date.now()
  const slot = Math.max(now, nextSlotAt)
  if (slot - now > MAX_WAIT_MS) return unavailable
  nextSlotAt = slot + interval
  if (slot > now) await new Promise<void>(r => setTimeout(r, slot - now))

  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'invoices.kz-supplier-search (support@invoices.kz)', Accept: 'text/html', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    // После редиректа остаёмся на том же сайте: иначе чужую страницу не разбираем.
    if (res.status !== 200 || (res.url && new URL(res.url).hostname !== 'www.made-in-china.com')) { record(false); return unavailable }
    const html = await res.text()
    if (html.length > MAX_BYTES) { record(false); return unavailable }
    const items = parseMicSearch(html, searchUrl)
    if (!items) { record(false); return unavailable }
    record(true)
    const value: MicResult = { status: 'ok', searchUrl, items }
    if (cache.size >= RESULT_CACHE_MAX) cache.clear()
    cache.set(searchUrl, { at: Date.now(), value })
    return value
  } catch (e) {
    console.error('made-in-china: request failed:', e instanceof Error ? e.message : e)
    record(false)
    return unavailable
  }
}
