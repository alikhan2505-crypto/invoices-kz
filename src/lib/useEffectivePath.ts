'use client'
import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { isProductHost, productHostRewrite } from './hostRouting'

const BASE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN || 'invoices.kz'
const noopSubscribe = () => () => {}

// On a product subdomain the proxy rewrites "/" to the product's real page, but
// the browser (and usePathname) still says "/". Nav, theme and top bar decide
// by path, so they need the rewritten one; server render keeps the raw path.
export function useEffectivePath(): string {
  const path = usePathname()
  const host = useSyncExternalStore(noopSubscribe, () => window.location.hostname, () => '')
  return productHostRewrite(host, path, BASE_DOMAIN) ?? path
}

// True when the page is served from a product subdomain (menu shows only that product).
export function useProductHost(): boolean {
  const host = useSyncExternalStore(noopSubscribe, () => window.location.hostname, () => '')
  return isProductHost(host, BASE_DOMAIN)
}
