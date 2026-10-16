import type { Metadata } from 'next'
import { API_HOST_BASE } from '@/lib/hostRouting'
import VisitBeacon from '@/components/VisitBeacon'

// Canonical follows the redirect switch: apex path until API_HOST_REDIRECT=1,
// then the api subdomain root.
const PAGE_URL = API_HOST_BASE === 'https://api.invoices.kz' ? 'https://api.invoices.kz/' : 'https://invoices.kz/cashier-api'

// The root layout (src/app/layout.tsx) sets a metadata title/description
// aimed at the accounting-software buyer ("INVOICES.KZ -- Счета, АВР, КП и
// Накладные..."), which would otherwise be inherited here verbatim. This
// page targets a completely different audience (developers integrating
// Kaspi Pay), so it needs its own segment-level override.
export const metadata: Metadata = {
  title: 'Kaspi Cashier API — invoices.kz',
  // ru + kk в одной строке (как у хаба, src/app/page.tsx): api.invoices.kz
  // выходит в поиске отдельным лендингом, а язык по умолчанию — казахский.
  description: 'Принимайте Kaspi Pay на своём сайте: создание платежа, QR-ссылка и вебхук об оплате. 2% с оплаченного — без абонплаты и минимального оборота. Сайтыңызда Kaspi Pay қабылдаңыз: төлем құру, QR-сілтеме және төлем туралы вебхук. Төленген сомадан 2% — абоненттік төлемсіз және ең аз айналым талабынсыз.',
  // Without its own canonical this page inherited the root's, which pointed
  // at the homepage and asked search engines not to index this page at all.
  alternates: { canonical: PAGE_URL },
  // The root layout's openGraph/twitter objects aren't merged field-by-field --
  // omitting these here would leak the accounting-software OG image/copy into
  // link previews shared with developers (Slack, Telegram, Twitter).
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    siteName: 'INVOICES.KZ',
    title: 'Kaspi Cashier API — invoices.kz',
    description: 'Kaspi Pay на вашем сайте: создание платежа, QR-ссылка и вебхук об оплате. 2% с оплаченного, без абонплаты и минимального оборота. Сайтыңыздағы Kaspi Pay: төлем құру, QR-сілтеме және төлем туралы вебхук. Төленген сомадан 2%, абоненттік төлемсіз.',
    images: [{ url: 'https://invoices.kz/og-cashier-api.png', width: 1200, height: 630, alt: 'Kaspi Cashier API — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kaspi Cashier API — invoices.kz',
    description: 'Kaspi Pay на вашем сайте: 2% с оплаченного, без абонплаты и минимального оборота. Сайтыңыздағы Kaspi Pay: төленген сомадан 2%, абоненттік төлемсіз.',
    images: ['https://invoices.kz/og-cashier-api.png'],
  },
}

export default function CashierApiLayout({ children }: { children: React.ReactNode }) {
  return <><VisitBeacon />{children}</>
}
