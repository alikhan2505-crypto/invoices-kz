import Link from 'next/link'
import { Guide, GuideLang, guidePath, guidesIndexPath, otherGuides } from '@/lib/guides'

// Shared chrome for every guide page in both languages: header, breadcrumb,
// language switch, prose container, cross-links and the schema.org markup.
// Server component on purpose -- a guide is prose, so shipping a client
// bundle for it would only slow down the one thing these pages exist for
// (being crawled and read).

const CHROME: Record<GuideLang, {
  section: string
  updated: string
  locale: string
  breadcrumbHome: string
  ctaTitle: string
  ctaBody: string
  ctaLink: string
  alsoRead: string
  switchLabel: string
}> = {
  ru: {
    section: 'Полезное',
    updated: 'Обновлено',
    locale: 'ru-KZ',
    breadcrumbHome: 'Главная',
    ctaTitle: 'Счета, АВР и накладные — за минуту',
    ctaBody:
      'Реквизиты подставляются по БИН, подпись и печать уже внутри PDF, отправка клиенту в WhatsApp одной кнопкой и оплата через Kaspi прямо со счёта. Для ИП и ТОО, первые 7 дней бесплатно.',
    ctaLink: 'Посмотреть, как это работает →',
    alsoRead: 'Читайте также',
    switchLabel: 'Қазақша',
  },
  kk: {
    section: 'Пайдалы',
    updated: 'Жаңартылған',
    locale: 'kk-KZ',
    breadcrumbHome: 'Басты бет',
    ctaTitle: 'Шоттар, ОЖА және жүкқұжаттар — бір минутта',
    ctaBody:
      'Деректемелер БСН бойынша автоматты толтырылады, қолтаңба мен мөр PDF ішінде, клиентке WhatsApp арқылы бір түймемен жіберіледі, төлем Kaspi арқылы тікелей шоттан түседі. ЖК және ЖШС үшін, алғашқы 7 күн тегін.',
    ctaLink: 'Бұл қалай жұмыс істейтінін қараңыз →',
    alsoRead: 'Тағы оқыңыз',
    switchLabel: 'Русский',
  },
}

function GuideJsonLd({ guide, lang }: { guide: Guide; lang: GuideLang }) {
  const chrome = CHROME[lang]
  const copy = guide[lang]
  const url = `https://invoices.kz${guidePath(guide.slug, lang)}`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: copy.title,
        description: copy.description,
        inLanguage: chrome.locale,
        dateModified: guide.updated,
        datePublished: guide.updated,
        mainEntityOfPage: url,
        author: { '@id': 'https://invoices.kz/#organization' },
        publisher: { '@id': 'https://invoices.kz/#organization' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: chrome.breadcrumbHome, item: 'https://invoices.kz' },
          {
            '@type': 'ListItem',
            position: 2,
            name: chrome.section,
            item: `https://invoices.kz${guidesIndexPath(lang)}`,
          },
          { '@type': 'ListItem', position: 3, name: copy.title, item: url },
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
  lang,
  children,
}: {
  guide: Guide
  lang: GuideLang
  children: React.ReactNode
}) {
  const chrome = CHROME[lang]
  const copy = guide[lang]
  const others = otherGuides(guide.slug)
  const otherLang: GuideLang = lang === 'kk' ? 'ru' : 'kk'

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <GuideJsonLd guide={guide} lang={lang} />
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg flex-shrink-0" />
            <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
              invoices.kz
            </Link>
            <span className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>/</span>
            <Link
              href={guidesIndexPath(lang)}
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--nav-text-secondary)' }}
            >
              {chrome.section}
            </Link>
          </div>
          {/* A real link, not a toggle: the other language is its own URL, so
              this doubles as the path a crawler follows to it. */}
          <Link
            href={guidePath(guide.slug, otherLang)}
            hrefLang={otherLang}
            className="text-xs font-semibold rounded-full px-3 py-1.5 flex-shrink-0"
            style={{
              color: 'var(--nav-text-secondary)',
              background: 'var(--nav-surface-glass)',
              border: '1px solid var(--nav-border)',
            }}
          >
            {chrome.switchLabel}
          </Link>
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {copy.title}
        </h1>
        <p className="text-xs mb-6" style={{ color: 'var(--nav-text-muted)' }}>
          {chrome.updated}{' '}
          {new Date(guide.updated).toLocaleDateString(chrome.locale, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>

        <article className="guide-prose nav-glass rounded-2xl p-5 lg:p-7">{children}</article>

        <div className="nav-glass nav-card-accent rounded-2xl p-5 mt-6">
          <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
            {chrome.ctaTitle}
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
            {chrome.ctaBody}
          </p>
          <Link href="/#features" className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
            {chrome.ctaLink}
          </Link>
        </div>

        {others.length > 0 && (
          <div className="mt-8">
            <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>
              {chrome.alsoRead}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {others.map(g => (
                <Link
                  key={g.slug}
                  href={guidePath(g.slug, lang)}
                  className="nav-glass rounded-xl p-4 block"
                  style={{ color: 'var(--nav-text-primary)' }}
                >
                  <div className="text-sm font-semibold mb-1">{g[lang].shortTitle}</div>
                  <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                    {g[lang].title}
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
