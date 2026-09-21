import type { Metadata } from 'next'
import { Unbounded, Onest, Caveat } from 'next/font/google'
import ProductsHub from './ProductsHub'

// Marketing-surface fonts (DESIGN.md §7). Loaded here, on the one route that
// uses them, so the cabinets keep shipping only Geist.
const unbounded = Unbounded({ subsets: ['cyrillic', 'latin'], weight: ['700'], variable: '--font-unbounded', display: 'swap' })
const onest = Onest({ subsets: ['cyrillic', 'latin'], variable: '--font-onest', display: 'swap' })
const caveat = Caveat({ subsets: ['cyrillic', 'latin'], weight: ['600'], variable: '--font-caveat', display: 'swap' })

export const metadata: Metadata = {
  title: 'Продукты — invoices.kz',
  description: 'Счета, Kaspi, Kaspi Cashier API и AI-агент под одним аккаунтом. Оставьте в меню только то, что нужно вашему делу.',
}

export default function ProductsPage() {
  return <ProductsHub fontClass={`${unbounded.variable} ${onest.variable} ${caveat.variable}`} />
}
