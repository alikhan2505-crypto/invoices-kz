#!/usr/bin/env node
// Runs from the GitHub Actions runner, not Vercel -- Kaspi returns a
// persistent HTTP 403 to this endpoint from Vercel's IP ranges AND from a
// bare GitHub Actions fetch with no browser-like headers (confirmed live
// 2026-08-14). Unlike the earlier product-page-HTML approach this script
// used to take, kaspi.kz/yml/offer-view/offers/{sku} is a real,
// unauthenticated per-merchant offers API -- it needs a full
// same-origin-request header set (Referer + sec-fetch-*) to get past
// Kaspi's block, copied verbatim from a captured real working browser
// request. This script does the actual fetch to kaspi.kz itself, then
// reports each result back to the Vercel API, which does the pricing math
// (including filtering out the seller's own blocklisted merchants -- this
// script has no opinion on that, it just reports raw offers).

const baseUrl = process.env.BASE_URL || 'https://www.invoices.kz'
const secret = process.env.KASPI_SHOP_CRON_SECRET

const CITY_ID = '750000000' // Almaty -- legacy reference city, used only when a product has no targetCities configured
const OFFERS_LIMIT = 50 // covers every real product observed live (max seen: 30 offers) in one request, no pagination needed

async function fetchOffersForCity(kaspiSku, cityId) {
  const productPageUrl = `https://kaspi.kz/shop/p/-${encodeURIComponent(kaspiSku)}/?c=${cityId}`
  const res = await fetch(`https://kaspi.kz/yml/offer-view/offers/${encodeURIComponent(kaspiSku)}`, {
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
    body: JSON.stringify({ cityId, id: kaspiSku, merchantUID: [], limit: OFFERS_LIMIT, page: 0, sortOption: 'PRICE' }),
  })
  if (!res.ok) {
    throw new Error(`Kaspi offer-view fetch failed for sku ${kaspiSku} city ${cityId}: HTTP ${res.status}`)
  }
  const json = await res.json()
  const offers = Array.isArray(json.offers) ? json.offers : []
  return offers
    .filter(o => o && o.merchantId != null && Number(o.price) > 0)
    .map(o => ({ merchantId: String(o.merchantId), price: Number(o.price) }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  if (!secret) {
    console.error('KASPI_SHOP_CRON_SECRET is not set')
    process.exit(1)
  }

  const dueRes = await fetch(`${baseUrl}/api/kaspi-shop/cron/due`, {
    headers: { 'x-kaspi-shop-cron-secret': secret },
  })
  if (!dueRes.ok) {
    console.error(`due endpoint failed: HTTP ${dueRes.status}`)
    process.exit(1)
  }
  const { due } = await dueRes.json()
  console.log(`${due.length} product(s) due`)

  for (const product of due) {
    // Kaspi's public offer-view endpoint wants the MASTER product id
    // ("133206576"), not this seller's combined kaspi_sku
    // ("133206576_392235481") -- confirmed 2026-08-21 via a live browser
    // capture of the real product page's own network call. Querying with
    // the combined string returns HTTP 200 with an empty offers array, so
    // this silently reported "0 competitors" on every run until now.
    const lookupSku = product.kaspiMasterSku || product.kaspiSku
    let competitorOffers = null
    let perCityOffers = null
    let fetchError = null
    try {
      if (product.targetCities && product.targetCities.length > 0) {
        perCityOffers = {}
        for (const cityCode of product.targetCities) {
          perCityOffers[cityCode] = await fetchOffersForCity(lookupSku, cityCode)
          await sleep(300)
        }
      } else {
        competitorOffers = await fetchOffersForCity(lookupSku, CITY_ID)
      }
    } catch (err) {
      fetchError = err.message
    }

    const applyRes = await fetch(`${baseUrl}/api/kaspi-shop/cron/apply`, {
      method: 'POST',
      headers: { 'x-kaspi-shop-cron-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ trackedProductId: product.id, competitorOffers, perCityOffers, fetchError }),
    })
    if (!applyRes.ok) {
      console.error(`apply failed for ${product.id}: HTTP ${applyRes.status}`)
    } else {
      const offerCount = perCityOffers ? Object.values(perCityOffers).reduce((sum, arr) => sum + arr.length, 0) : (competitorOffers ? competitorOffers.length : 0)
      console.log(`${product.id}: ${offerCount} offer(s) across ${perCityOffers ? Object.keys(perCityOffers).length : 1} cit(y/ies), fetchError=${fetchError}`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
