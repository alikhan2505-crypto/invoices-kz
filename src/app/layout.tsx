import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'INVOICES.KZ — Счета на оплату за 1 минуту',
  description: 'Создавайте профессиональные счета на оплату для казахстанского бизнеса. БИН/ИИН, ИИК, БИК, PDF с подписью и печатью. Отправка через WhatsApp. Бесплатно.',
  keywords: 'счет на оплату казахстан, выставить счет кз, счет фактура казахстан, ИП счет, ТОО счет, БИН ИИН счет, invoices kz',
  manifest: '/manifest.json',
  authors: [{ name: 'INVOICES.KZ' }],
  creator: 'INVOICES.KZ',
  publisher: 'INVOICES.KZ',
  robots: 'index, follow',
  alternates: {
    canonical: 'https://invoices.kz',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'INVOICES.KZ',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz',
    siteName: 'INVOICES.KZ',
    title: 'INVOICES.KZ — Счета на оплату за 1 минуту',
    description: 'Создавайте профессиональные счета для казахстанского бизнеса. PDF с подписью, отправка через WhatsApp, история оплат. 3 счёта бесплатно.',
    images: [
      {
        url: 'https://invoices.kz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'INVOICES.KZ — Счета на оплату для казахстанского бизнеса',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'INVOICES.KZ — Счета на оплату за 1 минуту',
    description: 'Профессиональные счета для казахстанского бизнеса. Бесплатно.',
    images: ['https://invoices.kz/og-image.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#1C2056',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="yandex-verification" content="" />
        <meta name="google-site-verification" content="" />
        <link rel="canonical" href="https://invoices.kz" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}