import type { Metadata } from 'next'
import { storefrontMetadata } from '../../storefrontMetadata'

export async function generateMetadata({ params }: { params: Promise<{ slug: string; modelId: string }> }): Promise<Metadata> {
  const { slug, modelId } = await params
  return storefrontMetadata(slug, 'model', `/shop/${encodeURIComponent(slug)}/catalog/${encodeURIComponent(modelId)}`, modelId)
}

export default function WholesaleModelLayout({ children }: { children: React.ReactNode }) {
  return children
}
