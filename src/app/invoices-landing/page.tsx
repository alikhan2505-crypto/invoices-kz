import type { Metadata } from 'next'
import InvoicesLandingPage from '@/components/marketing/InvoicesLandingPage'

// The Счета marketing page's real address once the apex root becomes the
// Products Hub (see src/lib/rootHub.ts). Reached publicly through
// docs.invoices.kz (root '/' rewritten here by hostRouting.ts) -- this exact
// path also stays live at invoices.kz/invoices-landing, which is fine to
// leave unlinked rather than gated, same as every other product's /lp/*.
//
// Metadata is about Счета only (14.10.2026): Kaspi Bot, AI-агент, Cashier API,
// Салон and CFO each have their own landing now. Title/description are ru + kk
// at once, same format as src/app/lp/[key]/page.tsx (the page's language lives
// in the browser, the server can't know it). NOTE: apex '/' (while
// ROOT_HUB_LIVE is off) still inherits the layout's own default tags, not these.
const TITLE = 'Счета, АВР и КП с оплатой Kaspi · Kaspi арқылы төленетін шот, ОЖА және КҰ | invoices.kz'
const DESCRIPTION =
  'Счета, КП, АВР и накладные за минуту: PDF с подписью и печатью, ссылка и QR Kaspi Pay прямо в счёте, оплата подтверждается сама. ЭЦП, ЭСФ и сверка оплат по выписке — для ИП и ТОО Казахстана. ' +
  'Шот, КҰ, ОЖА және жүкқұжат бір минутта: қолтаңба мен мөрі бар PDF, шоттың өзінде Kaspi Pay сілтемесі мен QR коды, төлем өздігінен расталады. ЖК мен ЖШС үшін.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: 'счет на оплату казахстан, выставить счет онлайн, счет с оплатой kaspi pay, kaspi qr в счете, АВР казахстан, акт выполненных работ онлайн, накладная на отпуск запасов, коммерческое предложение, счет с НДС 16%, ЭСФ из счета, ЭЦП подпись документов, сверка оплат по выписке, счет ИП ТОО БИН, шот жазу онлайн, төлем шоты, орындалған жұмыстар актісі, жүкқұжат, invoices kz',
  alternates: { canonical: 'https://docs.invoices.kz/' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    alternateLocale: ['kk_KZ'],
    url: 'https://docs.invoices.kz/',
    siteName: 'INVOICES.KZ',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: 'https://invoices.kz/og-invoices.png', width: 1200, height: 630, alt: 'INVOICES.KZ — счета, АВР и КП с оплатой Kaspi' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['https://invoices.kz/og-invoices.png'],
  },
}

export default function InvoicesLandingRoute() {
  return <InvoicesLandingPage />
}
