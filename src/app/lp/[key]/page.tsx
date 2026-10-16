import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Unbounded, Onest } from 'next/font/google'
import { LANDINGS, isLandingKey } from '@/lib/landings'
import ProductLanding from '@/components/products/ProductLanding'
import VisitBeacon from '@/components/VisitBeacon'

// Marketing-surface fonts (DESIGN.md §7), loaded only on these landings.
const unbounded = Unbounded({ subsets: ['cyrillic', 'latin'], weight: ['700'], variable: '--font-unbounded', display: 'swap' })
const onest = Onest({ subsets: ['cyrillic', 'cyrillic-ext', 'latin'], variable: '--font-onest', display: 'swap' })

export const dynamicParams = false

export function generateStaticParams() {
  return Object.keys(LANDINGS).map((key) => ({ key }))
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params
  if (!isLandingKey(key)) return {}
  const l = LANDINGS[key]
  // CFO is in closed beta: keep it out of search until it opens. (Not keyed off access === 'invite' --
  // salon is also invite-only but its indexing must stay as is.) Remove this when cfo goes 'open'.
  const robots = key === 'cfo' ? { index: false } : undefined
  // Поисковикам — русский + казахский сразу (язык страницы живёт в браузере,
  // сервер его не знает); как на хабе /products. Бренд — один раз, в конце.
  const title = `${l.metaTitle.replace(/\s*\|\s*invoices\.kz$/, '')} · ${l.metaTitleKk} | invoices.kz`
  const description = `${l.metaDescription} ${l.metaDescriptionKk}`
  return {
    ...(robots && { robots }),
    title,
    description,
    alternates: { canonical: `${l.origin}/` },
    openGraph: { type: 'website', url: `${l.origin}/`, siteName: 'INVOICES.KZ', title, description },
  }
}

export default async function LandingPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!isLandingKey(key)) notFound()
  return <><VisitBeacon /><ProductLanding landing={key} fontClass={`${unbounded.variable} ${onest.variable}`} /></>
}
