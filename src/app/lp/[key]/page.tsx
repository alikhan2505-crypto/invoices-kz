import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Unbounded, Onest } from 'next/font/google'
import { LANDINGS, isLandingKey, landingSeo } from '@/lib/landings'
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
  // CFO и Салон закрыты (admin-only «скоро», решение основателя 23.10.2026 для салона):
  // держим их вне поиска, пока не откроются. Убрать условие, когда продукт станет открытым.
  const robots = key === 'cfo' || key === 'salon' ? { index: false } : undefined
  // Поисковикам — только русский: язык страницы живёт в браузере, отдельного
  // URL/hreflang для казахской версии нет, а смесь двух языков в одной строке
  // выходила за лимиты сниппета (title <= 60, description <= 155).
  const { title, description } = landingSeo(key)
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
