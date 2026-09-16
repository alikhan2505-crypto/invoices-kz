import type { Metadata } from 'next'
import Link from 'next/link'
import { GUIDES } from '@/lib/guides'

export const metadata: Metadata = {
  title: 'Полезное для бизнеса Казахстана — гайды invoices.kz',
  description:
    'Разборы для ИП, ТОО и продавцов Kaspi: комиссия Kaspi Магазина по категориям, как выставить счёт на оплату, чем отличаются счёт, АВР, накладная и КП. Бесплатно, без регистрации.',
  keywords:
    'счет на оплату ип казахстан, комиссия kaspi магазина, авр казахстан, накладная на отпуск запасов, коммерческое предложение кз, документы для ип рк',
  alternates: { canonical: 'https://invoices.kz/guides' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/guides',
    siteName: 'INVOICES.KZ',
    title: 'Полезное для бизнеса Казахстана — гайды invoices.kz',
    description:
      'Комиссия Kaspi по категориям, как выставить счёт для ИП и ТОО, чем отличаются счёт, АВР, накладная и КП.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'Полезное — invoices.kz' }],
  },
}

export default function GuidesIndex() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
          <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
            invoices.kz
          </Link>
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          Полезное
        </h1>
        <p className="text-sm mb-7" style={{ color: 'var(--nav-text-secondary)' }}>
          Короткие разборы по документам и деньгам для ИП, ТОО и продавцов Kaspi. Без воды и без регистрации.
        </p>

        <div className="grid gap-3">
          {GUIDES.map(g => (
            <Link
              key={g.slug}
              href={`/guides/${g.slug}`}
              className="nav-glass rounded-2xl p-5 block"
              style={{ color: 'var(--nav-text-primary)' }}
            >
              <div className="text-base font-semibold mb-1.5">{g.title}</div>
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                {g.description}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8">
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>
            Бесплатные инструменты
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/tools/margin" className="nav-glass rounded-xl p-4 block" style={{ color: 'var(--nav-text-primary)' }}>
              <div className="text-sm font-semibold mb-1">Калькулятор маржи Kaspi</div>
              <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                Сколько остаётся с продажи после комиссии, доставки и налога
              </div>
            </Link>
            <Link href="/tools/waybills" className="nav-glass rounded-xl p-4 block" style={{ color: 'var(--nav-text-primary)' }}>
              <div className="text-sm font-semibold mb-1">Склейка накладных Kaspi</div>
              <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                Накладные одним PDF: 4 на лист А4 или А6 на термопринтер
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
