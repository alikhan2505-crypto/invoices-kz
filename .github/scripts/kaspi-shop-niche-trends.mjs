#!/usr/bin/env node
// Runs from the GitHub Actions runner, not Vercel -- same reason as
// kaspi-shop-niche-check.mjs: Kaspi returns a persistent HTTP 403 (nginx)
// to /yml/product-view/pl/filters from both Vercel's and a bare GitHub
// Actions fetch's IP ranges. The header sets below are copied verbatim
// from the proven-working niche-check (search) and price-check (offers)
// scripts -- reused as-is rather than re-derived.
//
// One run now does THREE passes:
//   1. Search: every category in KASPI_TRENDING_CATEGORIES x 3 pages
//      (deeper sampling for the «Витрина ниш» collections; page 0 alone
//      keeps feeding the trends math server-side).
//   2. Deliver search results in chunks of 18 page-results per POST --
//      54 raw bodies in one POST would blow Vercel's ~4.5MB body limit.
//   3. Sellers: for every unique SKU seen, one offer-view call (the
//      repricer's proven per-SKU offers endpoint) -> sellers count,
//      delivered as final offerCounts POSTs. Always sends at least one
//      offerCounts POST (even empty) so the server-side retention
//      delete runs daily.
//
// KASPI_TRENDING_CATEGORIES here is a duplicate of the list in
// src/lib/kaspiShop/nicheTrends.ts -- GitHub Actions scripts are plain
// .mjs and not part of the Next.js/TS build, so they can't import that
// file directly (same precedent as CITY_ID being duplicated across the
// niche-check/price-check scripts). Keep both lists in sync.

const baseUrl = process.env.BASE_URL || 'https://www.invoices.kz'
const secret = process.env.KASPI_SHOP_CRON_SECRET

const CITY_ID = '750000000' // Almaty -- same as the other Kaspi Shop scripts, no city picker
// Captured ONCE at process start and sent with every deliver POST: the
// offers pass runs ~8-15 min after the search pass, so a run started
// near UTC midnight would otherwise write snapshots under date D while
// the sellers updates look for date D+1 and silently match nothing
// (final-review finding, 2026-08-24).
const SNAPSHOT_DATE = new Date().toISOString().slice(0, 10)
const FETCH_TIMEOUT_MS = 15000 // per Kaspi request -- a stalled socket must not eat the workflow budget
const DELIVER_TIMEOUT_MS = 60000 // deliver POSTs hit our own route (maxDuration 60)
const REQUEST_DELAY_MS = 500 // throttle between search fetches
const OFFERS_DELAY_MS = 300 // throttle between offer-view fetches (~650 SKUs -> ~8 min pass)
const OFFERS_LIMIT = 50 // covers every real product observed live (max seen: 30 offers)
// Confirmed live 2026-08-24 (run 32722161713): this endpoint 400s on
// page=2 for every category -- only pages 0 and 1 exist for its
// free-text search shape. 2 pages x 18 categories ~= 407 unique SKUs.
const PAGES_PER_CATEGORY = 2
const DELIVER_CHUNK_SIZE = 18 // page-results per deliver POST, keeps bodies well under Vercel's limit
const OFFER_COUNTS_CHUNK_SIZE = 150 // sellers counts per POST, matches the route's maxDuration budget
const MAX_OFFER_SKUS = 800 // hard safety cap on the sellers pass

const KASPI_TRENDING_CATEGORIES = [
  { key: 'beauty-health', label: 'Красота и здоровье' },
  { key: 'pharmacy', label: 'Аптека' },
  { key: 'home-garden', label: 'Товары для дома и дачи' },
  { key: 'appliances', label: 'Бытовая техника' },
  { key: 'clothing', label: 'Одежда' },
  { key: 'shoes', label: 'Обувь' },
  { key: 'phones-gadgets', label: 'Телефоны и гаджеты' },
  { key: 'computers', label: 'Ноутбуки и компьютеры' },
  { key: 'kids', label: 'Детские товары' },
  { key: 'accessories', label: 'Аксессуары' },
  { key: 'furniture', label: 'Мебель' },
  { key: 'sport', label: 'Спорт и отдых' },
  { key: 'auto', label: 'Автотовары' },
  { key: 'construction', label: 'Строительство и ремонт' },
  { key: 'pets', label: 'Зоотовары' },
  { key: 'books-hobby', label: 'Книги и хобби' },
  { key: 'jewelry-watches', label: 'Часы и украшения' },
  { key: 'office', label: 'Канцтовары и офис' },
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchCategoryPage(label, page) {
  const url = `https://kaspi.kz/yml/product-view/pl/filters?text=${encodeURIComponent(label)}&page=${page}&all=false&fl=true&ui=d&c=${CITY_ID}`
  const searchPageUrl = `https://kaspi.kz/shop/search/?text=${encodeURIComponent(label)}`
  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json, text/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Referer: searchPageUrl,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    return { upstreamStatus: res.status, upstreamBodyText: await res.text() }
  } catch (err) {
    return { upstreamStatus: 0, upstreamBodyText: String(err) }
  }
}

// Card ids from a raw search body -- same fields the server-side parser
// (mapNicheResponse) keys products on, extracted here only to know which
// SKUs the sellers pass should visit.
function extractSkus(bodyText) {
  try {
    const json = JSON.parse(bodyText)
    const cards = Array.isArray(json?.data?.cards) ? json.data.cards : []
    // .slice(0, 12) mirrors mapNicheResponse's server-side cap -- SKUs
    // beyond it would get sellers counts with no snapshot row to update.
    return cards.slice(0, 12).map(c => String(c.id ?? c.configSku ?? '')).filter(Boolean)
  } catch {
    return []
  }
}

// Sellers count for one SKU via kaspi.kz/yml/offer-view/offers/{sku} --
// endpoint, headers and offer-validity filter copied verbatim from
// kaspi-shop-price-check.mjs (the proven-working repricer path). Returns
// null on any failure: the SKU then simply carries no sellers count
// today and drops out of the «Мало продавцов» collection only.
async function fetchSellersCount(sku) {
  const productPageUrl = `https://kaspi.kz/shop/p/-${encodeURIComponent(sku)}/?c=${CITY_ID}`
  try {
    const res = await fetch(`https://kaspi.kz/yml/offer-view/offers/${encodeURIComponent(sku)}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/*',
        'content-type': 'application/json; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Referer: productPageUrl,
        Origin: 'https://kaspi.kz',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ cityId: CITY_ID, id: sku, merchantUID: [], limit: OFFERS_LIMIT, page: 0, sortOption: 'PRICE' }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const json = await res.json()
    const offers = Array.isArray(json.offers) ? json.offers : []
    return offers.filter(o => o && o.merchantId != null && Number(o.price) > 0).length
  } catch {
    return null
  }
}

async function deliver(payload) {
  const res = await fetch(`${baseUrl}/api/kaspi-shop/niches/trends/deliver`, {
    method: 'POST',
    headers: { 'x-kaspi-shop-cron-secret': secret, 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, snapshotDate: SNAPSHOT_DATE }),
    signal: AbortSignal.timeout(DELIVER_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`deliver failed: HTTP ${res.status}`)
  return res.json().catch(() => ({}))
}

async function main() {
  if (!secret) {
    console.error('KASPI_SHOP_CRON_SECRET is not set')
    process.exit(1)
  }

  // Pass 1: search, 3 pages per category.
  const results = []
  const skuSet = new Set()
  for (const category of KASPI_TRENDING_CATEGORIES) {
    for (let page = 0; page < PAGES_PER_CATEGORY; page++) {
      const { upstreamStatus, upstreamBodyText } = await fetchCategoryPage(category.label, page)
      results.push({ categoryKey: category.key, categoryLabel: category.label, page, upstreamStatus, upstreamBodyText })
      if (upstreamStatus >= 200 && upstreamStatus < 300) {
        for (const sku of extractSkus(upstreamBodyText)) skuSet.add(sku)
      }
      console.log(`${category.key} p${page}: upstreamStatus=${upstreamStatus}`)
      await sleep(REQUEST_DELAY_MS)
    }
  }

  // Pass 2: deliver search results in chunks.
  let upserted = 0
  let failed = 0
  for (let i = 0; i < results.length; i += DELIVER_CHUNK_SIZE) {
    const summary = await deliver({ results: results.slice(i, i + DELIVER_CHUNK_SIZE) })
    upserted += summary.upserted || 0
    failed += summary.failed || 0
  }
  console.log(`search delivered: pages=${results.length} upserted=${upserted} failed=${failed}`)

  // Pass 3: sellers counts.
  const skus = [...skuSet].slice(0, MAX_OFFER_SKUS)
  const offerCounts = []
  let offersFailed = 0
  for (const sku of skus) {
    const sellersCount = await fetchSellersCount(sku)
    if (sellersCount === null) offersFailed++
    else offerCounts.push({ sku, sellersCount })
    await sleep(OFFERS_DELAY_MS)
  }
  console.log(`offers: skus=${skus.length} ok=${offerCounts.length} failed=${offersFailed}`)

  // Always at least one offerCounts POST -- it also triggers the
  // server-side retention delete.
  if (offerCounts.length === 0) {
    await deliver({ offerCounts: [] })
    console.log('offerCounts delivered: empty (offers pass produced nothing)')
  } else {
    for (let i = 0; i < offerCounts.length; i += OFFER_COUNTS_CHUNK_SIZE) {
      const summary = await deliver({ offerCounts: offerCounts.slice(i, i + OFFER_COUNTS_CHUNK_SIZE) })
      console.log(`offerCounts chunk delivered: updated=${summary.updated} updateFailed=${summary.updateFailed} unmatched=${summary.unmatched}`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
