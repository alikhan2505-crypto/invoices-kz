import type { Metadata } from 'next'

// The root layout (src/app/layout.tsx) sets a metadata title/description
// aimed at the accounting-software buyer ("INVOICES.KZ -- Счета, АВР, КП и
// Накладные..."), which would otherwise be inherited here verbatim. This
// page targets a completely different audience (developers integrating
// Kaspi Pay), so it needs its own segment-level override.
export const metadata: Metadata = {
  title: 'Kaspi Cashier API — invoices.kz',
  description: 'Принимайте Kaspi Pay на своём сайте: создание платежа, QR-ссылка и вебхук об оплате. 2% с оплаченного — без абонплаты и минимального оборота.',
  // The root layout's openGraph/twitter objects aren't merged field-by-field --
  // omitting these here would leak the accounting-software OG image/copy into
  // link previews shared with developers (Slack, Telegram, Twitter).
  openGraph: {
    type: 'website',
    url: 'https://invoices.kz/cashier-api',
    siteName: 'INVOICES.KZ',
    title: 'Kaspi Cashier API — invoices.kz',
    description: 'Kaspi Pay на вашем сайте: создание платежа, QR-ссылка и вебхук об оплате. 2% с оплаченного, без абонплаты и минимального оборота.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'Kaspi Cashier API — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kaspi Cashier API — invoices.kz',
    description: 'Kaspi Pay на вашем сайте: 2% с оплаченного, без абонплаты и минимального оборота.',
    images: ['https://invoices.kz/og-image.png'],
  },
}

export default function CashierApiLayout({ children }: { children: React.ReactNode }) {
  return children
}
