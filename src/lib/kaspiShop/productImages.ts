import type { CatalogSearchProduct } from './addProduct'

// Fills in product photos from Kaspi's own catalogue.
//
// image_url on a tracked product is backfilled off ORDER ITEMS, so it appears
// only once the product has actually sold — 11 of 194 on the live account. The
// AI agent can attach a product photo to a reply, but only for products that
// have one, so for most of a catalogue it silently has nothing to send.
//
// Kaspi's cabinet search (searchCatalogProducts) returns previewImages for any
// catalogue card, sold or not. This turns that into a photo for every product,
// keyed on the master SKU so a name that matches several cards cannot put the
// wrong picture on a product.

export interface ImageMatchCandidate {
  masterSku: string | null
  productName: string
}

/**
 * The image for `masterSku` among search results, or null.
 *
 * Matched on the catalogue id rather than the name. Kaspi's search is a text
 * search: "Abil.Sisters F01kor" returns every colour and size of that shirt,
 * and four products on the live account carry exactly that name. Taking the
 * first hit would give most of them a photo of a different variant — which is
 * worse than no photo, because it looks correct.
 */
export function pickCatalogImage(masterSku: string | null, results: CatalogSearchProduct[]): string | null {
  if (!masterSku) return null
  const exact = results.find(r => r.id === masterSku)
  return exact?.imageUrl || null
}

/**
 * The query to search a product by. The master SKU is tried as the query
 * itself: it is the catalogue card's own id, so when Kaspi accepts it the
 * result set is exactly one card. The product name is the fallback for when
 * it does not.
 */
export function imageSearchQueries(product: ImageMatchCandidate): string[] {
  const queries: string[] = []
  if (product.masterSku) queries.push(product.masterSku)
  const name = product.productName.trim()
  if (name) queries.push(name)
  return queries
}
