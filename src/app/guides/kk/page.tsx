import type { Metadata } from 'next'
import Link from 'next/link'
import { GUIDES } from '@/lib/guides'

export const metadata: Metadata = {
  title: 'Қазақстан бизнесі үшін пайдалы — invoices.kz нұсқаулары',
  description:
    'ЖК, ЖШС және Kaspi сатушылары үшін талдаулар: санаттар бойынша Kaspi Магазин комиссиясы, төлемге шотты қалай шығару керек, шот, ОЖА, жүкқұжат және КҰ айырмашылығы. Тегін, тіркелусіз.',
  keywords:
    'ип үшін төлемге шот қазақстан, kaspi магазин комиссиясы, ожа қазақстан, жүкқұжат, коммерциялық ұсыныс, ип құжаттары рк',
  alternates: {
    canonical: 'https://invoices.kz/guides/kk',
    languages: { ru: 'https://invoices.kz/guides', kk: 'https://invoices.kz/guides/kk' },
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
  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
            <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
              invoices.kz
            </Link>
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
        </div>

        <div className="mt-8">
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>
            Тегін құралдар
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/tools/margin" className="nav-glass rounded-xl p-4 block" style={{ color: 'var(--nav-text-primary)' }}>
              <div className="text-sm font-semibold mb-1">Kaspi маржа калькуляторы</div>
              <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                Комиссия, жеткізу және салықтан кейін сатудан қанша қалады
              </div>
            </Link>
            <Link href="/tools/waybills" className="nav-glass rounded-xl p-4 block" style={{ color: 'var(--nav-text-primary)' }}>
              <div className="text-sm font-semibold mb-1">Kaspi жүкқұжаттарын желімдеу</div>
              <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                Жүкқұжаттар бір PDF-те: А4 парағына 4-тен немесе термопринтерге А6
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
