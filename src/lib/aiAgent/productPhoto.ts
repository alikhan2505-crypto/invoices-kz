// Picks the product photo to attach to a reply, if any.
//
// Deliberately NOT a tool the model calls. We learned on 2026-09-07 what
// happens when an action depends on the model choosing to invoke it: given
// create_invoice_draft with tool_choice:auto, it wrote "сейчас подготовлю
// счёт" and never called it, and the sale was lost in silence. A photo has the
// same shape of failure — "вот фото" with no photo — so the decision is made
// here, after the text exists, from what the reply actually says.
//
// The rule the founder set is the strict one: if a product has no photo, show
// nothing at all. So only products that already carry an image_url are ever
// candidates, and an ambiguous match sends nothing rather than guessing.

export interface CatalogProduct {
  name: string
  price: number
  imageUrl?: string | null
}

// Below this share of a product's own words appearing in the reply, the match
// is not a mention — it is two products that happen to share a word like
// "салфетки". Tuned against real replies, where the agent quotes the catalogue
// name nearly verbatim because the prompt tells it to.
const MIN_SCORE = 0.7

// One- and two-letter tokens carry no identifying weight ("и", "на", "1"), and
// including them lets a long name match on filler alone.
const MIN_TOKEN_LEN = 3

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(w => w.length >= MIN_TOKEN_LEN)
}

/**
 * Returns the image URL to attach, or null.
 *
 * Null whenever there is any doubt: no product named, the named product has no
 * photo, or two products score equally. Sending the wrong photo is worse than
 * sending none — a customer shown someone else's product will believe it is
 * the one they asked about.
 */
export function pickProductPhoto(replyText: string, catalog: CatalogProduct[]): string | null {
  const withPhotos = catalog.filter(p => p.imageUrl && p.name)
  if (withPhotos.length === 0 || !replyText.trim()) return null

  const replyTokens = new Set(tokenize(replyText))
  if (replyTokens.size === 0) return null

  let best: { url: string; score: number } | null = null
  let runnerUp = 0

  for (const product of withPhotos) {
    const tokens = tokenize(product.name)
    if (tokens.length === 0) continue
    const hits = tokens.filter(w => replyTokens.has(w)).length
    const score = hits / tokens.length
    if (score < MIN_SCORE) continue
    if (!best || score > best.score) {
      if (best) runnerUp = best.score
      best = { url: product.imageUrl as string, score }
    } else if (score > runnerUp) {
      runnerUp = score
    }
  }

  if (!best) return null
  // A tie means two products match the reply equally well — size or colour
  // variants of the same thing, most often. Neither is safe to pick.
  if (best.score === runnerUp) return null
  return best.url
}
