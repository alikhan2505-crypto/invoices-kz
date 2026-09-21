import { PRODUCTS, type ProductKey } from './products'

// "Go there, do it, come back" between products (stage 5 of the product split).
// A link to another product carries where the person came from
// (?from=kaspiShop&back=/kaspi-shop/storefront); the target shows a banner
// with a way back. Pure and testable; the browser side is HandoffBanner.

const ORIGINS: Partial<Record<ProductKey, string>> = {
  kaspiShop: 'https://kaspi.invoices.kz',
  kaspiApi: 'https://api.invoices.kz',
  aiAgent: 'https://agent.invoices.kz',
}

// Only paths of the product cabinets can be a way back -- never an arbitrary URL.
const BACK_PREFIXES = ['/kaspi-shop', '/ai-agent', '/kaspi-api']

export function isProductionHost(hostname: string): boolean {
  return hostname === 'invoices.kz' || hostname.endsWith('.invoices.kz')
}

// On localhost and preview hosts the product subdomains don't exist, so links
// stay on the current host.
function originFor(product: ProductKey, hostname: string): string {
  return isProductionHost(hostname) ? ORIGINS[product] ?? '' : ''
}

export function crossProductHref(o: { to: ProductKey; path: string; from: ProductKey; back: string; hostname: string }): string {
  const qs = new URLSearchParams({ from: o.from, back: o.back }).toString()
  return `${originFor(o.to, o.hostname)}${o.path}${o.path.includes('?') ? '&' : '?'}${qs}`
}

function isSafeBack(back: string | null): back is string {
  if (!back || !back.startsWith('/') || back.startsWith('//') || back.includes('\\')) return false
  return BACK_PREFIXES.some((p) => back === p || back.startsWith(`${p}/`) || back.startsWith(`${p}?`))
}

export type Handoff = { from: ProductKey; back: string }

export function parseHandoff(search: string): Handoff | null {
  const params = new URLSearchParams(search)
  const from = params.get('from')
  const back = params.get('back')
  if (!from || !Object.prototype.hasOwnProperty.call(ORIGINS, from) || !isSafeBack(back)) return null
  return { from: from as ProductKey, back }
}

export function handoffReturnHref(h: Handoff, hostname: string): string {
  return `${originFor(h.from, hostname)}${h.back}`
}

export function handoffProductName(h: Handoff): string {
  return PRODUCTS.find((p) => p.key === h.from)?.name ?? ''
}
