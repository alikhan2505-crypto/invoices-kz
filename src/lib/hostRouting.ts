// Product subdomains (stage 3 of the product split). One deployment serves
// every host; a product host only changes what its root URL shows. Everything
// else (assets, /api/*, deep links) passes through untouched, so rolling back a
// host is just removing its row here.
const PRODUCT_HOST_ROUTES: Record<string, Record<string, string>> = {
  api: { '/': '/cashier-api', '/docs': '/kaspi-api/docs' },
  kaspi: { '/': '/lp/kaspi' },
  agent: { '/': '/lp/agent' },
  salon: { '/': '/lp/salon' },
}

// Returns the internal path to rewrite to, or null to leave the request alone.
export function productHostRewrite(hostname: string, pathname: string, baseDomain: string): string | null {
  const suffix = `.${baseDomain}`
  if (!hostname.endsWith(suffix)) return null
  const sub = hostname.slice(0, -suffix.length)
  const routes = Object.prototype.hasOwnProperty.call(PRODUCT_HOST_ROUTES, sub) ? PRODUCT_HOST_ROUTES[sub] : null
  if (!routes) return null
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return Object.prototype.hasOwnProperty.call(routes, clean) ? routes[clean] : null
}

// Stage 3, step 6: once api.<base> is live, the old apex addresses of the API
// product 301 to it. Off unless the caller passes enabled=true (env
// API_HOST_REDIRECT=1); the cabinet /kaspi-api stays on the apex on purpose.
const APEX_TO_API: Record<string, string> = { '/cashier-api': '/', '/kaspi-api/docs': '/docs' }

export function apexToApiRedirect(hostname: string, pathname: string, baseDomain: string, enabled: boolean): string | null {
  if (!enabled || hostname !== baseDomain) return null
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return Object.prototype.hasOwnProperty.call(APEX_TO_API, clean) ? `https://api.${baseDomain}${APEX_TO_API[clean]}` : null
}

export const API_HOST_BASE = process.env.API_HOST_REDIRECT === '1' ? 'https://api.invoices.kz' : 'https://invoices.kz'
