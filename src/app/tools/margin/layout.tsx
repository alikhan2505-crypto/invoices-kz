import type { Metadata } from 'next'

// Same reason /tools/waybills has its own layout: the page itself is a client
// component and can't export metadata, so without this it inherits the root
// title and shows up in search as if it were the homepage. This page exists
// to be found by a Kaspi seller searching for how much they actually earn per
// sale, so it needs its own words.
export const metadata: Metadata = {
  title: 'Калькулятор маржи Kaspi — расчёт прибыли с продажи | invoices.kz',
  description: 'Посчитайте прибыль с одной продажи на Kaspi после комиссии, доставки и налога. Калькулятор покажет маржинальность, наценку и минимальную цену, ниже которой торговать в убыток. Бесплатно, без регистрации, с выгрузкой в Excel.',
  keywords: 'калькулятор маржи kaspi, комиссия kaspi магазина расчет, как посчитать прибыль на kaspi, маржинальность товара калькулятор, минимальная цена kaspi, наценка на товар расчет, unit экономика kaspi',
  alternates: { canonical: 'https://invoices.kz/tools/margin' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/tools/margin',
    siteName: 'INVOICES.KZ',
    title: 'Калькулятор маржи Kaspi — сколько остаётся с продажи',
    description: 'Прибыль, маржинальность и минимальная цена с учётом комиссии Kaspi, доставки и налога. Бесплатно, без регистрации, выгрузка в Excel.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'Калькулятор маржи Kaspi — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Калькулятор маржи Kaspi — сколько остаётся с продажи',
    description: 'Прибыль, маржинальность и минимальная цена с учётом комиссии Kaspi, доставки и налога.',
    images: ['https://invoices.kz/og-image.png'],
  },
}

export default function MarginToolLayout({ children }: { children: React.ReactNode }) {
  return children
}
