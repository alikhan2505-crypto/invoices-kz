import { Order } from './cabinetApi'

// ABC analysis + attribute slices over real order items. Kaspi's order data
// carries no product characteristics (вид/размер/цвет) -- the only
// attribute source we actually have is the product NAME, so color/size here
// are extracted from names with word-boundary matching. This is an honest
// heuristic, not real catalog data, and the UI must say so ("определено по
// названию товара"); items whose name yields nothing simply fall out of the
// slice instead of being guessed.

export type AbcClass = 'A' | 'B' | 'C'

export type AbcRow = {
  code: string
  name: string
  imageUrl: string | null
  unitsSold: number
  revenue: number
  share: number
  cumulativeShare: number
  abcClass: AbcClass
}

export type AttributeSlice = { value: string; unitsSold: number; revenue: number }

// Common RU color stems seen in Kaspi product names, matched as TOKEN
// PREFIXES (JS \b and \w are ASCII-only, so regex word boundaries silently
// never match Cyrillic -- confirmed by this module's own tests). Longer
// stems are checked first per token so "серебр…" wins over "сер…".
const COLOR_STEMS: [string, string][] = [
  ['фиолетов', 'Фиолетовый'],
  ['коричнев', 'Коричневый'],
  ['оранжев', 'Оранжевый'],
  ['бирюзов', 'Бирюзовый'],
  ['сиренев', 'Сиреневый'],
  ['серебр', 'Серебряный'],
  ['графит', 'Графитовый'],
  ['молочн', 'Молочный'],
  ['бордов', 'Бордовый'],
  ['бежев', 'Бежевый'],
  ['розов', 'Розовый'],
  ['голуб', 'Голубой'],
  ['зелен', 'Зелёный'],
  ['зелён', 'Зелёный'],
  ['черн', 'Чёрный'],
  ['чёрн', 'Чёрный'],
  ['красн', 'Красный'],
  ['желт', 'Жёлтый'],
  ['жёлт', 'Жёлтый'],
  ['мятн', 'Мятный'],
  ['золот', 'Золотой'],
  ['хаки', 'Хаки'],
  ['бел', 'Белый'],
  ['сер', 'Серый'],
  ['син', 'Синий'],
]

// Letter sizes must stand alone (delimited) -- otherwise the S in
// "Sunlight" or the L in "XXL Universal" would false-positive. Numeric
// clothing sizes are accepted only as a standalone 38-58 token, which
// keeps quantities like "70 шт" out.
const LETTER_SIZE_RE = /(?:^|[\s,("/])((?:XXXL|3XL|4XL|2XL|XXL|XL|XS|S|M|L))(?=$|[\s,)"/.])/u
const NUMERIC_SIZE_RE = /(?:^|[\s,("/])(3[89]|4[0-9]|5[0-8])(?=$|[\s,)"/.])/u

// Matches a whole token starting with any COLOR_STEMS entry, same order (so
// "серебр" still wins over "сер" at the same position), plus an optional
// hyphenated intensity modifier right before it ("темно-синий",
// "светло-серый") -- without the optional group, "темно-синий" only lost
// "синий", leaving "темно" behind as residue so it no longer matched the
// "чёрный" variant's stripped name. Built once, not per call.
const COLOR_STRIP_RE = new RegExp(
  `(^|[^a-zа-яё0-9])(?:[a-zа-яё]+-)?(?:${COLOR_STEMS.map(([stem]) => stem).join('|')})[a-zа-яё]*(?=$|[^a-zа-яё0-9])`,
  'iu'
)

// Derives a grouping key that collapses colour/size variants of the same
// product ("Лонгслив Abil.Sisters темно-синий" / "...чёрный") into one
// bucket -- used by Отзывы' "По товарам" grouping (founder 2026-09-03: group
// by product, ignoring size and colour). Same honest-heuristic caveat as
// extractAttributes: text-based, not real catalog data -- a name this
// doesn't recognize a colour/size in is returned unchanged.
export function baseProductName(name: string): string {
  let result = name
  const letter = result.match(LETTER_SIZE_RE)
  if (letter && letter.index !== undefined) {
    result = result.slice(0, letter.index) + result.slice(letter.index + letter[0].length)
  } else {
    const numeric = result.match(NUMERIC_SIZE_RE)
    if (numeric && numeric.index !== undefined) {
      result = result.slice(0, numeric.index) + result.slice(numeric.index + numeric[0].length)
    }
  }
  const color = result.match(COLOR_STRIP_RE)
  if (color && color.index !== undefined) {
    result = result.slice(0, color.index) + result.slice(color.index + color[0].length)
  }
  return result.replace(/\s{2,}/g, ' ').trim()
}

export function extractAttributes(name: string): { color: string | null; size: string | null } {
  let color: string | null = null
  const tokens = name.toLowerCase().split(/[^a-zа-яё0-9]+/u).filter(Boolean)
  outer: for (const token of tokens) {
    for (const [stem, label] of COLOR_STEMS) {
      if (token.startsWith(stem)) { color = label; break outer }
    }
  }

  let size: string | null = null
  const letter = name.match(LETTER_SIZE_RE)
  if (letter) {
    size = letter[1].toUpperCase()
  } else {
    const numeric = name.match(NUMERIC_SIZE_RE)
    if (numeric) size = numeric[1]
  }

  return { color, size }
}

// Classic ABC by revenue contribution: products covering the first 80% of
// revenue are A, the next 15% are B, the tail is C. Cumulative share is
// evaluated INCLUSIVE of the current row.
export function computeAbc(orders: Order[]): AbcRow[] {
  const byCode = new Map<string, { name: string; imageUrl: string | null; unitsSold: number; revenue: number }>()
  for (const order of orders) {
    for (const item of order.items) {
      const bucket = byCode.get(item.code) || { name: item.name, imageUrl: item.imageUrl, unitsSold: 0, revenue: 0 }
      bucket.unitsSold += item.quantity
      bucket.revenue += item.totalPrice
      byCode.set(item.code, bucket)
    }
  }

  const rows = Array.from(byCode.entries())
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  if (totalRevenue <= 0) return []

  let cumulative = 0
  // Epsilon absorbs floating-point drift at the exact 80%/95% boundaries
  // (0.8 + 0.15 sums to 0.9500000000000001 in IEEE 754).
  const EPS = 1e-9
  return rows.map(r => {
    const share = r.revenue / totalRevenue
    cumulative += share
    const abcClass: AbcClass = cumulative <= 0.8 + EPS ? 'A' : cumulative <= 0.95 + EPS ? 'B' : 'C'
    return {
      code: r.code,
      name: r.name,
      imageUrl: r.imageUrl,
      unitsSold: r.unitsSold,
      revenue: r.revenue,
      share,
      cumulativeShare: cumulative,
      abcClass,
    }
  })
}

export function computeAttributeSlices(orders: Order[]): { byColor: AttributeSlice[]; bySize: AttributeSlice[] } {
  const colorMap = new Map<string, { unitsSold: number; revenue: number }>()
  const sizeMap = new Map<string, { unitsSold: number; revenue: number }>()
  for (const order of orders) {
    for (const item of order.items) {
      const { color, size } = extractAttributes(item.name)
      if (color) {
        const bucket = colorMap.get(color) || { unitsSold: 0, revenue: 0 }
        bucket.unitsSold += item.quantity
        bucket.revenue += item.totalPrice
        colorMap.set(color, bucket)
      }
      if (size) {
        const bucket = sizeMap.get(size) || { unitsSold: 0, revenue: 0 }
        bucket.unitsSold += item.quantity
        bucket.revenue += item.totalPrice
        sizeMap.set(size, bucket)
      }
    }
  }
  const toSlices = (m: Map<string, { unitsSold: number; revenue: number }>): AttributeSlice[] =>
    Array.from(m.entries())
      .map(([value, v]) => ({ value, unitsSold: v.unitsSold, revenue: v.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
  return { byColor: toSlices(colorMap), bySize: toSlices(sizeMap) }
}
