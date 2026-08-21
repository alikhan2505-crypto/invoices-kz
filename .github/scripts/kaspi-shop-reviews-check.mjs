#!/usr/bin/env node
// Runs from the GitHub Actions runner, not Vercel -- Kaspi returns a
// persistent HTTP 429 to kaspi.kz/yml/review-view/* from Vercel's IP ranges
// (confirmed live 2026-08-21: 61/61 tracked products failed identically),
// the same block class as offer-view/product-view elsewhere in this
// codebase. Headers below are the same confirmed-live set
// kaspi-shop-price-check.mjs already uses successfully against a sibling
// yml/* endpoint (Referer + sec-fetch-* + a real Chrome UA) -- a bare fetch
// with no headers gets blocked the same way a bare Vercel fetch does.
// URL/params are the ones captured live from a real browser request (see
// src/lib/kaspiShop/reviews.ts's module header for the full capture notes).

const baseUrl = process.env.BASE_URL || 'https://www.invoices.kz'
const secret = process.env.KASPI_SHOP_CRON_SECRET
const productsRaw = process.env.PRODUCTS

const CITY_ID = '750000000' // Almaty -- review content doesn't vary by city, only affects Referer
const LIMIT = 50 // matches MAX_REVIEWS_PER_PRODUCT in reviews.ts

function buildReviewsUrl(masterSku) {
  return `https://kaspi.kz/yml/review-view/api/v1/reviews/product/${encodeURIComponent(masterSku)}?filter=ALL&sort=POPULARITY&limit=${LIMIT}&withAgg=true`
}

function buildProductPageUrl(masterSku) {
  return `https://kaspi.kz/shop/p/-${encodeURIComponent(masterSku)}/?c=${CITY_ID}`
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchReviews(masterSku) {
  try {
    const res = await fetch(buildReviewsUrl(masterSku), {
      headers: {
        accept: 'application/json, text/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Referer: buildProductPageUrl(masterSku),
        Origin: 'https://kaspi.kz',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
    })
    const upstreamBodyText = await res.text()
    return { upstreamStatus: res.status, upstreamBodyText }
  } catch (err) {
    return { upstreamStatus: 0, upstreamBodyText: String(err) }
  }
}

async function main() {
  if (!secret) {
    console.error('KASPI_SHOP_CRON_SECRET is not set')
    process.exit(1)
  }
  let products
  try {
    products = JSON.parse(productsRaw)
  } catch {
    console.error('PRODUCTS is not valid JSON')
    process.exit(1)
  }
  if (!Array.isArray(products) || products.length === 0) {
    console.error('PRODUCTS is empty')
    process.exit(1)
  }

  let ok = 0
  let failed = 0

  for (let i = 0; i < products.length; i++) {
    const { trackedProductId, masterSku } = products[i]
    const { upstreamStatus, upstreamBodyText } = await fetchReviews(masterSku)
    if (upstreamStatus >= 200 && upstreamStatus < 300) ok += 1
    else failed += 1

    const ingestRes = await fetch(`${baseUrl}/api/kaspi-shop/reviews/ingest`, {
      method: 'POST',
      headers: { 'x-kaspi-shop-cron-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ trackedProductId, upstreamStatus, upstreamBodyText }),
    })
    if (!ingestRes.ok) {
      console.error(`ingest failed for ${trackedProductId}: HTTP ${ingestRes.status}`)
    }

    // Same 300ms gap price-check.mjs uses between per-city offer fetches to
    // the same Kaspi backend -- avoids hammering it with a burst of
    // sequential requests across a seller's whole tracked catalog.
    if (i < products.length - 1) await sleep(300)
  }

  console.log(`${products.length} product(s): ${ok} ok, ${failed} failed`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
