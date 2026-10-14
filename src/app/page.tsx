import type { Metadata } from 'next'
import { Unbounded, Onest, Caveat } from 'next/font/google'
import InvoicesLandingPage from '@/components/marketing/InvoicesLandingPage'
import ProductsHub from './products/ProductsHub'
import { ROOT_HUB_LIVE } from '@/lib/rootHub'

// Marketing-surface fonts (DESIGN.md §7), only actually used once the Hub is
// live here -- module-scope is the only place next/font/google can be
// called, so this can't itself be behind the flag.
const unbounded = Unbounded({ subsets: ['cyrillic', 'latin'], weight: ['700'], variable: '--font-unbounded', display: 'swap' })
const onest = Onest({ subsets: ['cyrillic', 'cyrillic-ext', 'latin'], variable: '--font-onest', display: 'swap' })
const caveat = Caveat({ subsets: ['cyrillic', 'cyrillic-ext', 'latin'], weight: ['600'], variable: '--font-caveat', display: 'swap' })

// Stage 5 of the product split (21.09.2026): '/' switches from the Счета
// pitch to the Products Hub once NEXT_PUBLIC_ROOT_HUB_LIVE=1 (see
// src/lib/rootHub.ts). Off (default) is byte-for-byte what '/' has always
// been -- no metadata override here, so it keeps inheriting the layout's
// existing title/description/OG (which already IS this page's own copy).
// On needs its own, distinct tags for the Hub.
export function generateMetadata(): Metadata {
  if (!ROOT_HUB_LIVE) return {}
  return {
    title: 'invoices.kz — сервисы для бизнеса в Казахстане · бизнеске арналған сервистер',
    description: 'Счета, Kaspi, Kaspi Cashier API, AI-агент и CFO-кабинет под одним аккаунтом. Шоттар, Kaspi, Kaspi Cashier API, AI-агент және CFO-кабинет — бір аккаунтта.',
    alternates: { canonical: 'https://invoices.kz' },
    // Своя карточка хаба (public/og-hub.png, собирается scripts/build-og-hub.mjs):
    // раньше '/' показывал в превью ссылки старую og-image.png про одни Счета.
    // openGraph сливается с layout поверхностно — поэтому все поля целиком.
    openGraph: {
      type: 'website',
      locale: 'ru_KZ',
      alternateLocale: ['kk_KZ'],
      url: 'https://invoices.kz',
      siteName: 'INVOICES.KZ',
      title: 'invoices.kz — сервисы для бизнеса в Казахстане · бизнеске арналған сервистер',
      description: 'Счета, Kaspi, Kaspi Cashier API, AI-агент и CFO-кабинет под одним аккаунтом. Шоттар, Kaspi, Kaspi Cashier API, AI-агент және CFO-кабинет — бір аккаунтта.',
      images: [{ url: 'https://invoices.kz/og-hub.png', width: 1200, height: 630, alt: 'INVOICES.KZ — сервисы для бизнеса в Казахстане · бизнеске арналған сервистер' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'invoices.kz — сервисы для бизнеса в Казахстане · бизнеске арналған сервистер',
      description: 'Счета, Kaspi, Kaspi Cashier API, AI-агент и CFO-кабинет под одним аккаунтом. Шоттар, Kaspi, Kaspi Cashier API, AI-агент және CFO-кабинет — бір аккаунтта.',
      images: ['https://invoices.kz/og-hub.png'],
    },
  }
}

export default function Home() {
  if (!ROOT_HUB_LIVE) return <InvoicesLandingPage />
  return <ProductsHub fontClass={`${unbounded.variable} ${onest.variable} ${caveat.variable}`} />
}
