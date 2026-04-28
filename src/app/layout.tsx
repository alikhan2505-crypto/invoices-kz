import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

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
  description: 'Создавайте профессиональные счета с ЭЦП для казахстанского бизнеса. БИН/ИИН, ИИК, PDF генерация.',
  keywords: 'счет на оплату, казахстан, ИП, ТОО, БИН, ИИН, PDF, ЭЦП',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'INVOICES.KZ',
  },
  openGraph: {
    title: 'INVOICES.KZ — Счета на оплату за 1 минуту',
    description: 'Создавайте профессиональные счета для казахстанского бизнеса',
    url: 'https://invoices.kz',
    siteName: 'INVOICES.KZ',
    locale: 'ru_KZ',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#1C2056',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}