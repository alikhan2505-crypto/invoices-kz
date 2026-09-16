import Link from 'next/link'
import { Guide, otherGuides } from '@/lib/guides'

// Shared chrome for every guide page: header, breadcrumb, prose container,
// cross-links and the schema.org markup. Server component on purpose -- a
// guide is prose, so shipping a client bundle for it would only slow down
// the one thing these pages exist for (being crawled and read).
//
// Deliberately Russian-only, unlike the trilingual landing and tools: these
// target Russian-language search queries, and a machine-translated long-form
// article would read worse than no translation at all. The founder can have
// proper kk/en versions written later.

function GuideJsonLd({ guide }: { guide: Guide }) {
  const url = `https://invoices.kz/guides/${guide.slug}`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: guide.title,
        description: guide.description,
        inLanguage: 'ru-KZ',
        dateModified: guide.updated,
        datePublished: guide.updated,
        mainEntityOfPage: url,
        author: { '@id': 'https://invoices.kz/#organization' },
        publisher: { '@id': 'https://invoices.kz/#organization' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://invoices.kz' },
          { '@type': 'ListItem', position: 2, name: 'Полезное', item: 'https://invoices.kz/guides' },
          { '@type': 'ListItem', position: 3, name: guide.title, item: url },
        ],
      },
    ],
  }
  return (
    <script
      type="application/ld+json"
      // Same escaping rule as StructuredData.tsx: this is data, never markup.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

export default function GuideShell({
  guide,
  children,
}: {
  guide: Guide
  children: React.ReactNode
}) {
  const others = otherGuides(guide.slug)

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <GuideJsonLd guide={guide} />
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
          <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
            invoices.kz
          </Link>
          <span className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>/</span>
          <Link href="/guides" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
            Полезное
          </Link>
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {guide.title}
        </h1>
        <p className="text-xs mb-6" style={{ color: 'var(--nav-text-muted)' }}>
          Обновлено {new Date(guide.updated).toLocaleDateString('ru-KZ', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <article className="guide-prose nav-glass rounded-2xl p-5 lg:p-7">{children}</article>

        <div className="nav-glass nav-card-accent rounded-2xl p-5 mt-6">
          <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
            Счета, АВР и накладные — за минуту
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
            Реквизиты подставляются по БИН, подпись и печать уже внутри PDF, отправка клиенту в WhatsApp одной кнопкой
            и оплата через Kaspi прямо со счёта. Для ИП и ТОО, первые 7 дней бесплатно.
          </p>
          <Link href="/#features" className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
            Посмотреть, как это работает →
          </Link>
        </div>

        {others.length > 0 && (
          <div className="mt-8">
            <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>
              Читайте также
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {others.map(g => (
                <Link
                  key={g.slug}
                  href={`/guides/${g.slug}`}
                  className="nav-glass rounded-xl p-4 block"
                  style={{ color: 'var(--nav-text-primary)' }}
                >
                  <div className="text-sm font-semibold mb-1">{g.shortTitle}</div>
                  <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                    {g.title}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
