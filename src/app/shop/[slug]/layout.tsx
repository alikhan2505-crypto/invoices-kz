import type { Metadata } from 'next'
import { storefrontMetadata } from './storefrontMetadata'

// Server wrapper only for <head>: the storefront page itself stays a client
// component (language lives in the browser, see StorefrontChrome).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return storefrontMetadata(slug, 'shop', `/shop/${encodeURIComponent(slug)}`)
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return children
}
