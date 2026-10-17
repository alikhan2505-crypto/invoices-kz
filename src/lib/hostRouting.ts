// Product subdomains (stage 3 of the product split). One deployment serves
// every host; a product host only changes what its root URL shows. Everything
// else (assets, /api/*, deep links) passes through untouched, so rolling back a
// host is just removing its row here.
const PRODUCT_HOST_ROUTES: Record<string, Record<string, string>> = {
  api: { '/': '/cashier-api', '/docs': '/kaspi-api/docs' },
  kaspi: { '/': '/lp/kaspi' },
  agent: { '/': '/lp/agent' },
  salon: { '/': '/lp/salon' },
  cfo: { '/': '/lp/cfo' },
  // Stage 5: the Счета marketing page's own address, once it moves off
  // apex '/' (see src/lib/rootHub.ts). Not gated here -- inert on its own
  // until the docs.invoices.kz domain itself is attached in Vercel, exactly
  // like every other host row above was before its own domain step.
  docs: { '/': '/invoices-landing' },
}

// True on a product subdomain (api., kaspi., agent., salon., cfo., docs.): there
// the menu shows only that product, not the whole platform.
export function isProductHost(hostname: string, baseDomain: string): boolean {
  const suffix = `.${baseDomain}`
  if (!hostname.endsWith(suffix)) return false
  return Object.prototype.hasOwnProperty.call(PRODUCT_HOST_ROUTES, hostname.slice(0, -suffix.length))
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

// CFO-кабинет живёт на своём поддомене: старые адреса invoices.kz/cfo/... ведут туда
// же с сохранением пути и параметров (как у остальных продуктов, куда попадают через
// переключатель). Временный 307 — чтобы откат был простым.
export function apexToCfoRedirect(hostname: string, pathname: string, search: string, baseDomain: string): string | null {
  if (hostname !== baseDomain && hostname !== `www.${baseDomain}`) return null
  if (pathname !== '/cfo' && !pathname.startsWith('/cfo/')) return null
  return `https://cfo.${baseDomain}${pathname}${search}`
}

export const API_HOST_BASE = process.env.API_HOST_REDIRECT === '1' ? 'https://api.invoices.kz' : 'https://invoices.kz'

// Адреса, которые на apex отвечают редиректом на ДРУГОЙ хост (api., cfo.).
// next/link префетчит ссылку в фоне, а редирект на чужой origin браузер для
// такого запроса запрещает (CORS-ошибка в консоли на каждой загрузке
// /kaspi-api, аудит 17.10.2026). У таких ссылок префетч выключаем: переход по
// клику это не меняет.
export function redirectsCrossHost(path: string, hostname?: string, baseDomain = 'invoices.kz'): boolean {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (Object.prototype.hasOwnProperty.call(APEX_TO_API, clean)) return true
  if (clean !== '/cfo' && !clean.startsWith('/cfo/')) return false
  // /cfo уходит на cfo. только с apex; на самом cfo. (и в локальной разработке) редиректа нет.
  return hostname === undefined || hostname === baseDomain || hostname === `www.${baseDomain}`
}

// Значение для пропа prefetch у <Link>: false там, где префетч упрётся в редирект
// на другой хост, иначе undefined (поведение по умолчанию).
export function linkPrefetch(path: string, hostname?: string, baseDomain?: string): false | undefined {
  return redirectsCrossHost(path, hostname, baseDomain) ? false : undefined
}
