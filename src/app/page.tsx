import type { Metadata } from 'next'
import { Unbounded, Onest, Caveat } from 'next/font/google'
import InvoicesLandingPage from '@/components/marketing/InvoicesLandingPage'
import ProductsHub from './products/ProductsHub'
import { ROOT_HUB_LIVE } from '@/lib/rootHub'

// Marketing-surface fonts (DESIGN.md §7), only actually used once the Hub is
// live here -- module-scope is the only place next/font/google can be
// called, so this can't itself be behind the flag.
const unbounded = Unbounded({ subsets: ['cyrillic', 'latin'], weight: ['700'], variable: '--font-unbounded', display: 'swap' })
const onest = Onest({ subsets: ['cyrillic', 'latin'], variable: '--font-onest', display: 'swap' })
const caveat = Caveat({ subsets: ['cyrillic', 'latin'], weight: ['600'], variable: '--font-caveat', display: 'swap' })

// Stage 5 of the product split (21.09.2026): '/' switches from the Счета
// pitch to the Products Hub once NEXT_PUBLIC_ROOT_HUB_LIVE=1 (see
// src/lib/rootHub.ts). Off (default) is byte-for-byte what '/' has always
// been -- no metadata override here, so it keeps inheriting the layout's
// existing title/description/OG (which already IS this page's own copy).
// On needs its own, distinct tags for the Hub.
export function generateMetadata(): Metadata {
  if (!ROOT_HUB_LIVE) return {}
  return {
    title: 'Продукты — invoices.kz',
    description: 'Счета, Kaspi, Kaspi Cashier API и AI-агент под одним аккаунтом. Оставьте в меню только то, что нужно вашему делу.',
    alternates: { canonical: 'https://invoices.kz' },
  }
}

export default function Home() {
  if (!ROOT_HUB_LIVE) return <InvoicesLandingPage />
  return <ProductsHub fontClass={`${unbounded.variable} ${onest.variable} ${caveat.variable}`} />
}
