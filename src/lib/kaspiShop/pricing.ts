// Kaspi has no confirmed instant single-SKU price-update endpoint (researched
// live 2026-08-11, guide.kaspi.kz) -- the only documented mechanism is an
// hourly-polled XML price-list feed. This module's output feeds that feed
// (see the /api/kaspi-shop/pricelist/[connectionId] route) -- it does not
// call Kaspi directly.
export function computeRepriceCandidate(params: {
  competitorPrice: number | null
  undercutStep: number
  floorPrice: number
}): { price: number; heldAtFloor: boolean } {
  if (params.competitorPrice === null) {
    // Nothing to undercut (no competitor offer found) -- hold at the floor
    // rather than guessing a price, since undercutting nothing isn't a
    // meaningful action.
    return { price: params.floorPrice, heldAtFloor: true }
  }
  const candidate = params.competitorPrice - params.undercutStep
  if (candidate < params.floorPrice) {
    return { price: params.floorPrice, heldAtFloor: true }
  }
  return { price: candidate, heldAtFloor: false }
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Matches the <kaspi_catalog> schema documented at guide.kaspi.kz/partner/ru/
// shop/goods/price_list -- fetched and reproduced faithfully 2026-08-11, not
// approximated. stockCount is whatever the seller entered at setup time (not
// live-synced -- inventory sync is explicitly out of scope for this
// repricer), used only to set availability's available yes/no.
export function generatePriceListXml(params: {
  companyName: string
  merchantId: string
  products: { sku: string; model: string; brand: string; storeId: string; stockCount: number; price: number }[]
}): string {
  const offers = params.products.map(p => `    <offer sku="${escapeXml(p.sku)}">
      <model>${escapeXml(p.model)}</model>
      <brand>${escapeXml(p.brand)}</brand>
      <availabilities>
        <availability available="${p.stockCount > 0 ? 'yes' : 'no'}" storeId="${escapeXml(p.storeId)}" stockCount="${p.stockCount}"/>
      </availabilities>
      <price>${Math.round(p.price)}</price>
    </offer>`).join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<kaspi_catalog date="${new Date().toISOString()}" xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <company>${escapeXml(params.companyName)}</company>
  <merchantid>${escapeXml(params.merchantId)}</merchantid>
  <offers>
${offers}
  </offers>
</kaspi_catalog>`
}
