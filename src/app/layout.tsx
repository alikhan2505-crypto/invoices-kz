import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LanguageProvider } from '@/components/LanguageProvider'
import TopUtilityBar from '@/components/TopUtilityBar'
import HandoffBanner from '@/components/HandoffBanner'
import NavAurora from '@/components/NavAurora'
import { Analytics } from '@vercel/analytics/next'
import StructuredData from '@/components/StructuredData'
import { LANG_BOOT_SCRIPT, LANG_HOLD_CSS } from '@/lib/langResolve'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'INVOICES.KZ — сервисы для бизнеса в Казахстане',
  description: 'Счета, АВР и КП, Kaspi Bot, Kaspi Cashier API, AI-агент и CFO-кабинет под одним аккаунтом для ИП и ТОО Казахстана.',
  keywords: 'счет на оплату казахстан, оплата Kaspi Pay для бизнеса, kaspi bot демпинг цен, витрина kaspi магазина, AI агент для бизнеса казахстан, АВР казахстан, акт выполненных работ онлайн, накладная на отпуск запасов, коммерческое предложение, счет фактура кз, документы для налоговой ИП, ТОО счет БИН ИИН, invoices kz, онлайн бухгалтерия казахстан',
  manifest: '/manifest.json',
  authors: [{ name: 'INVOICES.KZ' }],
  creator: 'INVOICES.KZ',
  publisher: 'INVOICES.KZ',
  robots: 'index, follow',
  alternates: { canonical: 'https://invoices.kz' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'INVOICES.KZ' },
  // Карточка по умолчанию для страниц без своей OG (инструменты, вход, тарифы…).
  // Корень invoices.kz теперь хаб продуктов, поэтому и запасная карточка — про
  // всю платформу, а не про одни Счета (старая og-image.png). Лендинги, гайды
  // и витрины задают свою OG сами (14.10.2026).
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    alternateLocale: ['kk_KZ'],
    url: 'https://invoices.kz',
    siteName: 'INVOICES.KZ',
    title: 'INVOICES.KZ — сервисы для бизнеса в Казахстане',
    description: 'Счета, АВР и КП, Kaspi Bot, Kaspi Cashier API, AI-агент и CFO-кабинет под одним аккаунтом для ИП и ТОО Казахстана.',
    images: [{ url: 'https://invoices.kz/og-hub.png', width: 1200, height: 630, alt: 'INVOICES.KZ — сервисы для бизнеса в Казахстане' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'INVOICES.KZ — сервисы для бизнеса в Казахстане',
    description: 'Счета, АВР и КП, Kaspi Bot, Kaspi Cashier API, AI-агент и CFO-кабинет под одним аккаунтом для ИП и ТОО Казахстана.',
    images: ['https://invoices.kz/og-hub.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#1C2056',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Серверный/статический HTML всегда русский (lang="ru"); язык посетителя
    // определяет встроенный скрипт ниже ещё до первой отрисовки и меняет
    // lang / data-lang-hold на <html> — отсюда suppressHydrationWarning.
    // Корневой layout намеренно НЕ читает cookies()/headers(): иначе все
    // публичные страницы стали бы динамическими. См. src/lib/langResolve.ts.
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: LANG_HOLD_CSS }} />
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
            <HandoffBanner />
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