// План сохранения для модалки «Цена и остатки» (src/app/kaspi-shop/removed/page.tsx).
//
// Kaspi хранит цену НА ГОРОД (cityPrices: [{ cityId, value }]), а модалка правит
// цену на каждой ТОЧКЕ (склад). Раньше страница слала все точки подряд: две точки
// одного города (PP1 и PP2 в Алматы по 1200), цену PP1 меняют на 1500, дальше
// уходит PP1 = 1500 и сразу PP2 = 1200 для того же города, и цена молча
// откатывается, а модалка пишет «Отправлено». Неизменённые точки тоже
// отправлялись заново и тратили бюджет изменений (аудит Kaspi 2026-11-06, K24).
//
// Теперь: уходят только изменённые точки, а у всех точек одного города цена в
// запросе одна и та же (новая цена города), поэтому одна запись не затирает другую.
// Остаток по-прежнему сохраняется отдельным запросом на точку: у запроса Kaspi одна
// availability.
import { parseMoneyInput, moneyParseMessage } from './moneyInput'

export type PointDraft = {
  storeCode: string
  cityId: string | null
  cityName: string | null
  // что показали в форме при загрузке и что в форме сейчас (строки как в полях)
  initialPrice: string
  price: string
  initialStock: string
  stockCount: string
}

export type PointSaveEntry = {
  storeCode: string
  cityId: string
  price: number
  stockCount: number | null
}

export type PointSavePlan = {
  entries: PointSaveEntry[]
  // блокирующие: сохранять нельзя, пока человек не поправит
  errors: string[]
  // предупреждения: сохранять можно, но человек должен знать
  warnings: string[]
}

function label(p: { cityName: string | null; storeCode: string }): string {
  return p.cityName ? `${p.cityName} (${p.storeCode})` : p.storeCode
}

function cityLabel(p: { cityName: string | null; cityId: string | null }): string {
  return p.cityName || p.cityId || 'город'
}

// Две записи числа равны, если равны значения (1200 и «1 200» - одно и то же);
// непонятные строки сравниваем как есть.
function sameMoney(a: string, b: string): boolean {
  const pa = parseMoneyInput(a)
  const pb = parseMoneyInput(b)
  if (pa.ok && pb.ok) return pa.value === pb.value
  if (!pa.ok && !pb.ok && pa.blank && pb.blank) return true
  return a.trim() === b.trim()
}

type Parsed = {
  draft: PointDraft
  priceChanged: boolean
  stockChanged: boolean
  price: number | null
  stock: number | null
}

export function planCityStockSaves(points: PointDraft[]): PointSavePlan {
  const errors: string[] = []
  const warnings: string[] = []
  const parsed: Parsed[] = []

  for (const draft of points) {
    const priceChanged = !sameMoney(draft.price, draft.initialPrice)
    const stockChanged = !sameMoney(draft.stockCount, draft.initialStock)
    const pr = parseMoneyInput(draft.price)
    const st = parseMoneyInput(draft.stockCount)
    const changed = priceChanged || stockChanged

    let price: number | null = null
    if (pr.ok) price = pr.value
    let stock: number | null = null
    if (st.ok) stock = st.value

    if (changed) {
      if (!draft.cityId) {
        errors.push(`${label(draft)}: у точки нет города, сохранить её нельзя.`)
        continue
      }
      if (!pr.ok) {
        errors.push(`${label(draft)}: ${moneyParseMessage('Цена', pr)}`)
        continue
      }
      if (pr.value <= 0) {
        errors.push(`${label(draft)}: цена должна быть больше нуля.`)
        continue
      }
      if (!st.ok && !st.blank) {
        errors.push(`${label(draft)}: ${moneyParseMessage('Остаток', st)}`)
        continue
      }
      if (st.ok && (!Number.isInteger(st.value) || st.value < 0)) {
        errors.push(`${label(draft)}: остаток должен быть целым числом, не меньше нуля.`)
        continue
      }
    }
    parsed.push({ draft, priceChanged, stockChanged, price, stock })
  }

  // Группировка по городу: цена Kaspi одна на город.
  const byCity = new Map<string, Parsed[]>()
  for (const p of parsed) {
    if (!p.draft.cityId) continue
    const list = byCity.get(p.draft.cityId) || []
    list.push(p)
    byCity.set(p.draft.cityId, list)
  }

  const entries: PointSaveEntry[] = []
  for (const [cityId, list] of byCity) {
    const changed = list.filter(p => p.priceChanged || p.stockChanged)
    if (changed.length === 0) continue
    const name = cityLabel(list[0].draft)

    const newPrices = Array.from(new Set(changed.filter(p => p.priceChanged && p.price !== null).map(p => p.price as number)))
    if (newPrices.length > 1) {
      errors.push(`${name}: у точек этого города разные новые цены (${newPrices.map(n => n.toLocaleString('ru-KZ')).join(' и ')} ₸). В Kaspi цена одна на весь город, укажите одинаковую.`)
      continue
    }
    const cityPrice = newPrices.length === 1 ? newPrices[0] : (changed[0].price as number)

    // Точки города, которые не трогали, но показывают другую цену: после
    // сохранения у них будет цена города. Не блокируем, но говорим.
    const siblingsDiffer = list.some(p => !(p.priceChanged || p.stockChanged) && p.price !== null && p.price !== cityPrice)
    if (siblingsDiffer) {
      warnings.push(`${name}: цена в Kaspi одна на весь город, у остальных точек города она тоже станет ${cityPrice.toLocaleString('ru-KZ')} ₸.`)
    }

    for (const p of changed) {
      entries.push({ storeCode: p.draft.storeCode, cityId, price: cityPrice, stockCount: p.stock })
    }
  }

  return { entries, errors, warnings }
}

// Живое предупреждение в модалке, пока человек правит: в одном городе у точек
// сейчас разные цены. Ничего не блокирует, только объясняет.
export function sameCityPriceMismatches(points: Pick<PointDraft, 'cityId' | 'cityName' | 'price'>[]): { cityId: string; cityName: string; prices: number[] }[] {
  const byCity = new Map<string, { name: string; prices: Set<number> }>()
  for (const p of points) {
    if (!p.cityId) continue
    const pr = parseMoneyInput(p.price)
    if (!pr.ok) continue
    const cur = byCity.get(p.cityId) || { name: cityLabel(p), prices: new Set<number>() }
    cur.prices.add(pr.value)
    byCity.set(p.cityId, cur)
  }
  const out: { cityId: string; cityName: string; prices: number[] }[] = []
  for (const [cityId, v] of byCity) {
    if (v.prices.size > 1) out.push({ cityId, cityName: v.name, prices: Array.from(v.prices).sort((a, b) => a - b) })
  }
  return out
}
