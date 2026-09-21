// Product subdomains (stage 3 of the product split). One deployment serves
// every host; a product host only changes what its root URL shows. Everything
// else (assets, /api/*, deep links) passes through untouched, so rolling back a
// host is just removing its row here.
const PRODUCT_HOST_ROUTES: Record<string, Record<string, string>> = {
  api: { '/': '/cashier-api', '/docs': '/kaspi-api/docs' },
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
