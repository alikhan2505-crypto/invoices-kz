import type { Metadata } from 'next'
import { Unbounded, Onest, Caveat } from 'next/font/google'
import ProductsHub from './ProductsHub'

// Marketing-surface fonts (DESIGN.md §7). Loaded here, on the one route that
// uses them, so the cabinets keep shipping only Geist.
const unbounded = Unbounded({ subsets: ['cyrillic', 'latin'], weight: ['700'], variable: '--font-unbounded', display: 'swap' })
const onest = Onest({ subsets: ['cyrillic', 'cyrillic-ext', 'latin'], variable: '--font-onest', display: 'swap' })
const caveat = Caveat({ subsets: ['cyrillic', 'cyrillic-ext', 'latin'], weight: ['600'], variable: '--font-caveat', display: 'swap' })

export const metadata: Metadata = {
  title: 'invoices.kz — сервисы для бизнеса в Казахстане · бизнеске арналған сервистер',
  description: 'Счета, Kaspi, Kaspi Cashier API, AI-агент и CFO-кабинет под одним аккаунтом. Шоттар, Kaspi, Kaspi Cashier API, AI-агент және CFO-кабинет — бір аккаунтта.',
  // Та же карточка хаба, что у '/' (public/og-hub.png); openGraph сливается с
  // layout поверхностно — поэтому все поля целиком.
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    alternateLocale: ['kk_KZ'],
    url: 'https://invoices.kz/products',
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

export default function ProductsPage() {
  return <ProductsHub fontClass={`${unbounded.variable} ${onest.variable} ${caveat.variable}`} />
}
