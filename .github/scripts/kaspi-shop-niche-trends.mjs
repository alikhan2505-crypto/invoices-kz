#!/usr/bin/env node
// Runs from the GitHub Actions runner, not Vercel -- same reason as
// kaspi-shop-niche-check.mjs: Kaspi returns a persistent HTTP 403 (nginx)
// to /yml/product-view/pl/filters from both Vercel's and a bare GitHub
// Actions fetch's IP ranges. The header set below (Referer + the
// sec-fetch-* triad) is copied verbatim from that same script -- it's
// the proven-working way past the block, reused as-is rather than
// re-derived.
//
// Unlike the on-demand single-keyword check (one query -> one checkId ->
// one deliver call), this script samples EVERY category in
// KASPI_TRENDING_CATEGORIES in one run, throttled with a sleep between
// requests, and reports all of them back to the trends deliver endpoint
// in a single batched POST.
//
// KASPI_TRENDING_CATEGORIES here is a duplicate of the list in
// src/lib/kaspiShop/nicheTrends.ts -- GitHub Actions scripts are plain
// .mjs and not part of the Next.js/TS build, so they can't import that
// file directly (same precedent as CITY_ID being duplicated across the
// niche-check/price-check scripts instead of shared). Keep both lists in
// sync if categories are ever added or renamed.

const baseUrl = process.env.BASE_URL || 'https://www.invoices.kz'
const secret = process.env.KASPI_SHOP_CRON_SECRET

const CITY_ID = '750000000' // Almaty -- same as the other Kaspi Shop scripts, no city picker in v1
const REQUEST_DELAY_MS = 500 // throttle between category fetches, same spirit as price-check.mjs's per-offer sleep

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

async function fetchCategory(label) {
  const url = `https://kaspi.kz/yml/product-view/pl/filters?text=${encodeURIComponent(label)}&page=0&all=false&fl=true&ui=d&c=${CITY_ID}`
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
    })
    return { upstreamStatus: res.status, upstreamBodyText: await res.text() }
  } catch (err) {
    return { upstreamStatus: 0, upstreamBodyText: String(err) }
  }
}

async function main() {
  if (!secret) {
    console.error('KASPI_SHOP_CRON_SECRET is not set')
    process.exit(1)
  }

  const results = []
  for (const category of KASPI_TRENDING_CATEGORIES) {
    const { upstreamStatus, upstreamBodyText } = await fetchCategory(category.label)
    results.push({ categoryKey: category.key, categoryLabel: category.label, upstreamStatus, upstreamBodyText })
    console.log(`${category.key}: upstreamStatus=${upstreamStatus}`)
    await sleep(REQUEST_DELAY_MS)
  }

  const deliverRes = await fetch(`${baseUrl}/api/kaspi-shop/niches/trends/deliver`, {
    method: 'POST',
    headers: { 'x-kaspi-shop-cron-secret': secret, 'content-type': 'application/json' },
    body: JSON.stringify({ results }),
  })
  if (!deliverRes.ok) {
    console.error(`deliver failed: HTTP ${deliverRes.status}`)
    process.exit(1)
  }
  const summary = await deliverRes.json().catch(() => ({}))
  console.log(`delivered ${results.length} categor(y/ies): upserted=${summary.upserted} failed=${summary.failed}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
