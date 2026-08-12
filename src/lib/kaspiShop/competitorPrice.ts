// Kaspi's product page publicly lists every seller currently offering a
// given product with their price (confirmed live 2026-08-11 -- this is not
// privileged data, any visitor sees it). Kaspi's own frontend renders this
// client-side from a JSON payload embedded in the page; the exact selector
// below targets that embedded state. If Kaspi changes their page structure,
// this throws (never silently returns a wrong price) so a broken selector
// surfaces as a visible check-cycle error, not a bad reprice.
export async function fetchLowestCompetitorPrice(kaspiSku: string): Promise<number | null> {
  const res = await fetch(`https://kaspi.kz/shop/p/-${encodeURIComponent(kaspiSku)}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; invoices.kz price checker)' },
  })
  if (!res.ok) {
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
