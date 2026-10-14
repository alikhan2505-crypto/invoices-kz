import type { Metadata } from 'next'
import { storefrontMetadata } from '../storefrontMetadata'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return storefrontMetadata(slug, 'catalog', `/shop/${encodeURIComponent(slug)}/catalog`)
}

export default function WholesaleCatalogLayout({ children }: { children: React.ReactNode }) {
  return children
}
