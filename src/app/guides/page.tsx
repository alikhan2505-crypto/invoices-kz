import type { Metadata } from 'next'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { GUIDES, guidesIndexAlternates } from '@/lib/guides'
import { bikGuidesIndexCard } from '@/lib/bikLinks'
import { toolLinkPath } from '@/lib/tools-i18n'
import { toolsIndexCards } from '@/lib/tools-i18n/toolsIndex'

export const metadata: Metadata = {
  title: 'Полезное для бизнеса Казахстана — гайды invoices.kz',
  description:
    'Разборы для ИП, ТОО и продавцов Kaspi: комиссия Kaspi, как выставить счёт на оплату, налоги ИП, ЭСФ, чем отличаются счёт, АВР, накладная и КП.',
  keywords:
    'счет на оплату ип казахстан, комиссия kaspi магазина, авр казахстан, накладная на отпуск запасов, коммерческое предложение кз, документы для ип рк',
  alternates: {
    canonical: 'https://invoices.kz/guides',
    languages: guidesIndexAlternates(),
  },
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
  const bikCard = bikGuidesIndexCard('ru')
  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5">
            <BrandWordmark height={15} />
          </div>
          <Link
            href="/guides/kk"
            hrefLang="kk"
            className="text-xs font-semibold rounded-full px-3 py-1.5"
            style={{
              color: 'var(--nav-text-secondary)',
              background: 'var(--nav-surface-glass)',
              border: '1px solid var(--nav-border)',
            }}
          >
            Қазақша
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
              <div className="text-base font-semibold mb-1.5">{g.ru.title}</div>
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                {g.ru.description}
              </div>
            </Link>
          ))}
          {bikCard && (
            <Link
              href={bikCard.href}
              className="nav-glass rounded-2xl p-5 block"
              style={{ color: 'var(--nav-text-primary)' }}
            >
              <div className="text-base font-semibold mb-1.5">{bikCard.title}</div>
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                {bikCard.text}
              </div>
            </Link>
          )}
        </div>

        <div className="mt-8">
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>
            Бесплатные инструменты
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {toolsIndexCards('ru').map(c => (
              <Link
                key={c.slug}
                href={toolLinkPath(c.slug, 'ru')}
                className="nav-glass rounded-xl p-4 block"
                style={{ color: 'var(--nav-text-primary)' }}
              >
                <div className="text-sm font-semibold mb-1">{c.title}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                  {c.text}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
