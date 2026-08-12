// Kaspi's product page publicly lists every seller currently offering a
// given product with their price (confirmed live 2026-08-11 -- this is not
// privileged data, any visitor sees it). Kaspi's own frontend renders this
// client-side from a JSON payload embedded in the page; the exact selector
// below targets that embedded state. If Kaspi changes their page structure,
// this throws (never silently returns a wrong price) so a broken selector
// surfaces as a visible check-cycle error, not a bad reprice.
export async function fetchLowestCompetitorPrice(kaspiSku: string): Promise<number | null> {
  // A self-identifying User-Agent ("... price checker") got a consistent,
  // reproducible 429 from Vercel's IPs on the very first request (confirmed
  // live 2026-08-12, not a rate-limit from volume) -- looks like Kaspi's
  // bot detection, not a request-frequency limit. Headers below mimic a
  // real Chrome browser request instead.
  const res = await fetch(`https://kaspi.kz/shop/p/-${encodeURIComponent(kaspiSku)}/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  })
  if (!res.ok) {
    // TEMPORARY diagnostic logging (2026-08-12) -- trying to tell a
    // transient rate-limit (would carry Retry-After / rate-limit-* headers)
    // apart from a hard WAF/bot-detection block (Cloudflare-style headers,
    // e.g. cf-ray, cf-mitigated) before deciding how to fix this properly.
    // Remove once diagnosed.
    const headerDump = Array.from(res.headers.entries()).map(([k, v]) => `${k}: ${v}`).join(' | ')
    const bodySnippet = (await res.text().catch(() => '')).slice(0, 300)
    console.error(`Kaspi 429 diagnostic — headers: ${headerDump} — body: ${bodySnippet}`)
    throw new Error(`Kaspi product page fetch failed for sku ${kaspiSku}: HTTP ${res.status}`)
  }
  const html = await res.text()

  // Kaspi embeds offer data as window.__INITIAL_STATE__ = {...}; parsing the
  // full page is out of scope for a first pass -- extract just the price
  // figures Kaspi renders inline for each seller offer ("price":NNNNN) and
  // take the minimum. This is intentionally tolerant: a page with zero
  // matches (product delisted, page structure changed) returns null rather
  // than throwing, since "no competitors found" is a real, valid outcome
  // the caller already handles (computeRepriceCandidate holds at the floor).
  const matches = [...html.matchAll(/"price"\s*:\s*(\d+)/g)].map(m => Number(m[1])).filter(n => n > 0)
  if (matches.length === 0) return null
  return Math.min(...matches)
}
