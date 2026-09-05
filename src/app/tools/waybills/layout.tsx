import type { Metadata } from 'next'

// Same reason cashier-api has its own layout: the page itself is a client
// component and can't export metadata, so without this it inherits the root
// title ("INVOICES.KZ — Счета, оплата Kaspi, Kaspi Bot и AI-агент...") and
// shows up in search as if it were the homepage. This page exists to be
// found by a Kaspi seller searching for how to print waybills, so it needs
// its own words.
export const metadata: Metadata = {
  title: 'Склейка накладных Kaspi — бесплатно, без регистрации | invoices.kz',
  description: 'Соберите накладные Kaspi Магазина в один PDF: по 4 на лист А4 или по одной в А6 для термопринтера. Бесплатно, без регистрации, файлы нигде не сохраняются.',
  keywords: 'склейка накладных kaspi, печать накладных kaspi магазин, накладные 4 на лист а4, накладные а6 термопринтер, объединить pdf накладные, kaspi магазин накладные распечатать',
  alternates: { canonical: 'https://invoices.kz/tools/waybills' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/tools/waybills',
    siteName: 'INVOICES.KZ',
    title: 'Склейка накладных Kaspi — бесплатно, без регистрации',
    description: 'Накладные Kaspi одним файлом: по 4 на лист А4 или по одной в А6 на термопринтер. Без регистрации, файлы не сохраняются.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'Склейка накладных Kaspi — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Склейка накладных Kaspi — бесплатно, без регистрации',
    description: 'Накладные Kaspi одним файлом: 4 на лист А4 или А6 на термопринтер.',
    images: ['https://invoices.kz/og-image.png'],
  },
}

export default function WaybillsToolLayout({ children }: { children: React.ReactNode }) {
  return children
}
