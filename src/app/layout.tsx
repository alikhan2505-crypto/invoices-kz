import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LanguageProvider } from '@/components/LanguageProvider'
import TopUtilityBar from '@/components/TopUtilityBar'
import NavAurora from '@/components/NavAurora'
import { Analytics } from '@vercel/analytics/next'
import StructuredData from '@/components/StructuredData'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'INVOICES.KZ — Счета, оплата Kaspi, Kaspi Bot и AI-агент для бизнеса Казахстана',
  description: 'Счета, АВР, накладные и КП с оплатой через Kaspi Pay — плюс демпинг-бот и публичная витрина для Kaspi Магазина и AI-агент для клиентов. Одна платформа, один кошелёк. Для ИП и ТОО Казахстана.',
  keywords: 'счет на оплату казахстан, оплата Kaspi Pay для бизнеса, kaspi bot демпинг цен, витрина kaspi магазина, склейка накладных kaspi, AI агент для бизнеса казахстан, АВР казахстан, акт выполненных работ онлайн, накладная на отпуск запасов, коммерческое предложение, счет фактура кз, документы для налоговой ИП, ТОО счет БИН ИИН, invoices kz, онлайн бухгалтерия казахстан',
  manifest: '/manifest.json',
  authors: [{ name: 'INVOICES.KZ' }],
  creator: 'INVOICES.KZ',
  publisher: 'INVOICES.KZ',
  robots: 'index, follow',
  alternates: { canonical: 'https://invoices.kz' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'INVOICES.KZ' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz',
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

export const viewport: Viewport = {
  themeColor: '#1C2056',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Подтверждение прав в Яндекс.Вебмастере. Стоит в общем <head>, поэтому
            отдаётся на обоих хостах (invoices.kz и www) — какой бы из них Яндекс
            ни проверял. Google подтверждён отдельно, DNS-записью на уровне
            домена (ресурс sc-domain:invoices.kz), поэтому мета-тег ему не нужен
            и пустой плейсхолдер здесь убран (2026-09-05). */}
        <meta name="yandex-verification" content="99d825a4e386fc08" />
        <StructuredData />
        {/* No hardcoded canonical here. It used to sit in this shared <head>,
            so EVERY route declared the homepage as its canonical URL --
            telling Google and Yandex that /tools/waybills, /cashier-api and
            the rest are duplicates of "/" and shouldn't be indexed on their
            own. Each route now sets its own via metadata.alternates.canonical
            (2026-09-05). */}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <LanguageProvider>
          <ThemeProvider>
            <NavAurora />
            {children}
            <TopUtilityBar />
            {/* Added 2026-09-04: the project had no visitor analytics of any
                kind, so there was no way to tell whether a paid campaign (or
                the free /tools/waybills funnel it points at) brought anyone.
                Pageviews only -- no custom events yet, and nothing that
                identifies a person. */}
            <Analytics />
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}