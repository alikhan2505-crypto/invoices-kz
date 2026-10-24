import type { Metadata } from 'next'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { GUIDES, guidesIndexAlternates } from '@/lib/guides'
import { bikGuidesIndexCard } from '@/lib/bikLinks'
import { toolLinkPath } from '@/lib/tools-i18n'
import { toolsIndexCards } from '@/lib/tools-i18n/toolsIndex'

export const metadata: Metadata = {
  title: 'Қазақстан бизнесі үшін пайдалы — invoices.kz нұсқаулары',
  description:
    'ЖК, ЖШС және Kaspi сатушылары үшін талдаулар: Kaspi комиссиясы, төлемге шотты қалай шығару, ЖК салықтары, ЭШФ, шот, ОЖА, жүкқұжат және КҰ айырмашылығы.',
  keywords:
    'ип үшін төлемге шот қазақстан, kaspi магазин комиссиясы, ожа қазақстан, жүкқұжат, коммерциялық ұсыныс, ип құжаттары рк',
  alternates: {
    canonical: 'https://invoices.kz/guides/kk',
    languages: guidesIndexAlternates(),
  },
  openGraph: {
    type: 'website',
    locale: 'kk_KZ',
    url: 'https://invoices.kz/guides/kk',
    siteName: 'INVOICES.KZ',
    title: 'Қазақстан бизнесі үшін пайдалы — invoices.kz нұсқаулары',
    description:
      'Санаттар бойынша Kaspi комиссиясы, ЖК және ЖШС үшін шотты қалай шығару керек, шот, ОЖА, жүкқұжат және КҰ айырмашылығы.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'Пайдалы — invoices.kz' }],
  },
}

export default function GuidesIndexKk() {
  const bikCard = bikGuidesIndexCard('kk')
  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5">
            <BrandWordmark height={15} />
          </div>
          <Link
            href="/guides"
            hrefLang="ru"
            className="text-xs font-semibold rounded-full px-3 py-1.5"
            style={{
              color: 'var(--nav-text-secondary)',
              background: 'var(--nav-surface-glass)',
              border: '1px solid var(--nav-border)',
            }}
          >
            Русский
          </Link>
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          Пайдалы
        </h1>
        <p className="text-sm mb-7" style={{ color: 'var(--nav-text-secondary)' }}>
          ЖК, ЖШС және Kaspi сатушылары үшін құжаттар мен ақша туралы қысқа талдаулар. Артық сөзсіз, тіркелусіз.
        </p>

        <div className="grid gap-3">
          {GUIDES.map(g => (
            <Link
              key={g.slug}
              href={`/guides/kk/${g.slug}`}
              className="nav-glass rounded-2xl p-5 block"
              style={{ color: 'var(--nav-text-primary)' }}
            >
              <div className="text-base font-semibold mb-1.5">{g.kk.title}</div>
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                {g.kk.description}
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
            Тегін құралдар
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {toolsIndexCards('kk').map(c => (
              <Link
                key={c.slug}
                href={toolLinkPath(c.slug, 'kk')}
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
