import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Unbounded, Onest } from 'next/font/google'
import { LANDINGS, isLandingKey } from '@/lib/landings'
import ProductLanding from '@/components/products/ProductLanding'

// Marketing-surface fonts (DESIGN.md §7), loaded only on these landings.
const unbounded = Unbounded({ subsets: ['cyrillic', 'latin'], weight: ['700'], variable: '--font-unbounded', display: 'swap' })
const onest = Onest({ subsets: ['cyrillic', 'latin'], variable: '--font-onest', display: 'swap' })

export const dynamicParams = false

export function generateStaticParams() {
  return Object.keys(LANDINGS).map((key) => ({ key }))
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params
  if (!isLandingKey(key)) return {}
  const l = LANDINGS[key]
  return {
    title: l.metaTitle,
    description: l.metaDescription,
    alternates: { canonical: `${l.origin}/` },
    openGraph: { type: 'website', url: `${l.origin}/`, siteName: 'INVOICES.KZ', title: l.metaTitle, description: l.metaDescription },
  }
}

export default async function LandingPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!isLandingKey(key)) notFound()
  return <ProductLanding landing={key} fontClass={`${unbounded.variable} ${onest.variable}`} />
}
