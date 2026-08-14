#!/usr/bin/env node
// Runs from the GitHub Actions runner, not Vercel -- Kaspi returns a
// persistent HTTP 403 (nginx) to this endpoint from BOTH Vercel's and
// GitHub Actions' IP ranges (confirmed 2026-08-14 -- unlike the sibling
// price-check script's endpoint, which only blocks Vercel). Live A/B
// testing from a real Chrome tab found the block is NOT cookie-dependent
// (a same-origin fetch with credentials:'omit' still succeeds) -- the
// distinguishing factor between the successful browser request and this
// script's plain fetch is the header set: a real same-origin XHR sends
// Referer + the sec-fetch-* triad, which a bare server-side fetch never
// does. Headers below are copied verbatim from a captured real, working
// browser request (see docs/superpowers/specs/2026-08-14-kaspi-shop-niches-design.md).

const baseUrl = process.env.BASE_URL || 'https://www.invoices.kz'
const secret = process.env.KASPI_SHOP_CRON_SECRET
const checkId = process.env.CHECK_ID
const query = process.env.QUERY

const CITY_ID = '750000000' // Almaty -- hardcoded in v1, no city picker

async function main() {
  if (!secret) {
    console.error('KASPI_SHOP_CRON_SECRET is not set')
    process.exit(1)
  }
  if (!checkId || !query) {
    console.error('CHECK_ID/QUERY is not set')
    process.exit(1)
  }

  const url = `https://kaspi.kz/yml/product-view/pl/filters?text=${encodeURIComponent(query)}&page=0&all=false&fl=true&ui=d&c=${CITY_ID}`
  const searchPageUrl = `https://kaspi.kz/shop/search/?text=${encodeURIComponent(query)}`

  let upstreamStatus = 0
  let upstreamBodyText = ''
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
    upstreamStatus = res.status
    upstreamBodyText = await res.text()
  } catch (err) {
    upstreamBodyText = String(err)
  }

  const deliverRes = await fetch(`${baseUrl}/api/kaspi-shop/niches/deliver`, {
    method: 'POST',
    headers: { 'x-kaspi-shop-cron-secret': secret, 'content-type': 'application/json' },
    body: JSON.stringify({ checkId, upstreamStatus, upstreamBodyText }),
  })
  if (!deliverRes.ok) {
    console.error(`deliver failed: HTTP ${deliverRes.status}`)
    process.exit(1)
  }
  console.log(`checkId=${checkId} upstreamStatus=${upstreamStatus} delivered`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
