import type { Metadata } from 'next'
import InvoicesLandingPage from '@/components/marketing/InvoicesLandingPage'

// The Счета marketing page's real address once the apex root becomes the
// Products Hub (see src/lib/rootHub.ts). Reached publicly through
// docs.invoices.kz (root '/' rewritten here by hostRouting.ts) -- this exact
// path also stays live at invoices.kz/invoices-landing, which is fine to
// leave unlinked rather than gated, same as every other product's /lp/*.
//
// Metadata mirrors the layout's own default tags byte for byte (title,
// description, keywords, OG/Twitter) -- that copy was written for exactly
// this page and must not silently change when '/' starts inheriting the
// Hub's own metadata instead.
export const metadata: Metadata = {
  title: 'INVOICES.KZ — Счета, оплата Kaspi, Kaspi Bot и AI-агент для бизнеса Казахстана',
  description: 'Счета, АВР, накладные и КП с оплатой через Kaspi Pay — плюс демпинг-бот и публичная витрина для Kaspi Магазина и AI-агент для клиентов. Одна платформа, один кошелёк. Для ИП и ТОО Казахстана.',
  keywords: 'счет на оплату казахстан, оплата Kaspi Pay для бизнеса, kaspi bot демпинг цен, витрина kaspi магазина, AI агент для бизнеса казахстан, АВР казахстан, акт выполненных работ онлайн, накладная на отпуск запасов, коммерческое предложение, счет фактура кз, документы для налоговой ИП, ТОО счет БИН ИИН, invoices kz, онлайн бухгалтерия казахстан',
  alternates: { canonical: 'https://docs.invoices.kz/' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://docs.invoices.kz/',
    siteName: 'INVOICES.KZ',
    title: 'INVOICES.KZ — Не только счета. Вся автоматизация бизнеса',
    description: 'Счета с оплатой Kaspi, демпинг-бот и витрина для Kaspi Магазина, AI-агент и ЭЦП — одна платформа, один кошелёк. 3 документа бесплатно.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'INVOICES.KZ — платформа автоматизации бизнеса Казахстана' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'INVOICES.KZ — Не только счета. Вся автоматизация бизнеса',
    description: 'Счета, оплата Kaspi, Kaspi Bot и AI-агент на одной платформе с единым кошельком.',
    images: ['https://invoices.kz/og-image.png'],
  },
}

export default function InvoicesLandingRoute() {
  return <InvoicesLandingPage />
}
