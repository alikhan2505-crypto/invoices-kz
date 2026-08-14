#!/usr/bin/env node
// Runs from the GitHub Actions runner, not Vercel -- Kaspi returns a
// persistent HTTP 429 to Kaspi product-page fetches from Vercel's IP ranges
// (confirmed 2026-08-12), but not from GitHub Actions' runner IPs. This
// script does the actual fetch to kaspi.kz itself, then reports each
// result back to the Vercel API, which does the rest (pricing, wallet
// debit, Supabase writes, Telegram notification).

const baseUrl = process.env.BASE_URL || 'https://www.invoices.kz'
const secret = process.env.KASPI_SHOP_CRON_SECRET

async function fetchCompetitorPrice(kaspiSku) {
  const res = await fetch(`https://kaspi.kz/shop/p/-${encodeURIComponent(kaspiSku)}/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  })
  if (!res.ok) {
    throw new Error(`Kaspi product page fetch failed for sku ${kaspiSku}: HTTP ${res.status}`)
  }
  const html = await res.text()
  const matches = [...html.matchAll(/"price"\s*:\s*(\d+)/g)].map(m => Number(m[1])).filter(n => n > 0)
  return matches.length ? Math.min(...matches) : null
}

// TEMPORARY diagnostic -- checking whether yml/offer-view/offers/{sku} (a
// richer, per-merchant competitor-price endpoint found live 2026-08-14) is
// reachable from this GitHub Actions runner, the same way the existing
// product-page scrape above already is. Remove once confirmed either way.
async function diagnosticCheckOfferViewEndpoint() {
  const testSku = '114958921'
  const productPageUrl = 'https://kaspi.kz/shop/p/termokruzhka-0-51-l-18712026-flow-3-chernyi-114958921/?c=750000000'
  try {
    const res = await fetch(`https://kaspi.kz/yml/offer-view/offers/${testSku}`, {
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
      body: JSON.stringify({ cityId: '750000000', id: testSku, merchantUID: [], limit: 5, page: 0, sortOption: 'PRICE' }),
    })
    const bodyText = await res.text()
    console.log(`[diagnostic] offer-view status=${res.status} bodyLen=${bodyText.length} bodyPreview=${bodyText.slice(0, 300)}`)
  } catch (err) {
    console.log(`[diagnostic] offer-view fetch threw: ${err}`)
  }
}

async function main() {
  if (!secret) {
    console.error('KASPI_SHOP_CRON_SECRET is not set')
    process.exit(1)
  }

  await diagnosticCheckOfferViewEndpoint()

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
    let competitorPrice = null
    let fetchError = null
    try {
      competitorPrice = await fetchCompetitorPrice(product.kaspiSku)
    } catch (err) {
      fetchError = err.message
    }

    const applyRes = await fetch(`${baseUrl}/api/kaspi-shop/cron/apply`, {
      method: 'POST',
      headers: { 'x-kaspi-shop-cron-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ trackedProductId: product.id, competitorPrice, fetchError }),
    })
    if (!applyRes.ok) {
      console.error(`apply failed for ${product.id}: HTTP ${applyRes.status}`)
    } else {
      console.log(`${product.id}: competitorPrice=${competitorPrice} fetchError=${fetchError}`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
