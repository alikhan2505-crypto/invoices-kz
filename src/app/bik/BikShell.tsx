import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { FEATURES_HREF } from '@/lib/rootHub'
import { toolLinkPath } from '@/lib/tools-i18n'
import { BIK_PAGES_UPDATED, bikHubPath, type BikLang } from '@/lib/bikRegistry'
import { CHROME, longDate, type FaqItem, type Para } from './bikContent'
import KkReviewNotice from '@/components/KkReviewNotice'

// Shared chrome for every /bik page in both languages. Mirrors GuideShell (same
// header, prose container, FAQ block and CTA) but takes its copy from
// bikContent.ts, because GuideShell is tied to the GUIDES registry.
// Server component: these pages are reference text, they must be in the
// prerendered HTML a crawler reads.

export function Paragraph({ para }: { para: Para }) {
  return (
    <p>
      {para.map((seg, i) => {
        if (typeof seg === 'string') return <span key={i}>{seg}</span>
        if (seg.external) {
          return (
            <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer">
              {seg.text}
            </a>
          )
        }
        return (
          <Link key={i} href={seg.href}>
            {seg.text}
          </Link>
        )
      })}
    </p>
  )
}

export default function BikShell({
  lang,
  title,
  summary,
  switchHref,
  faq,
  jsonLd,
  campaign,
  children,
}: {
  lang: BikLang
  title: string
  summary: string
  switchHref: string
  faq: FaqItem[]
  jsonLd: unknown
  /** utm_campaign for the CTA link. */
  campaign: string
  children: React.ReactNode
}) {
  const chrome = CHROME[lang]
  const otherLang: BikLang = lang === 'kk' ? 'ru' : 'kk'
  const toolCards = chrome.tools

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <script
        type="application/ld+json"
        // Same escaping rule as GuideShell / StructuredData.tsx: this is data, never markup.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandWordmark height={15} />
            <span className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>/</span>
            <Link
              href={bikHubPath(lang)}
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--nav-text-secondary)' }}
            >
              {chrome.section}
            </Link>
          </div>
          {/* A real link, not a toggle: the other language is its own URL. */}
          <Link
            href={switchHref}
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

        {/* Плашка «текст проверяется» (реестр: src/lib/kkReview.ts); для ru и вне реестра её нет. */}
        {lang === 'kk' && <KkReviewNotice className="mb-5" />}

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {title}
        </h1>
        <p className="text-xs mb-6" style={{ color: 'var(--nav-text-muted)' }}>
          {chrome.updated}{' '}
          {new Date(BIK_PAGES_UPDATED).toLocaleDateString(chrome.locale, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          {' · '}
          {chrome.checked}: {longDate(lang)}
        </p>

        <article className="guide-prose nav-glass rounded-2xl p-5 lg:p-7">
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border-soft)' }}
          >
            <div className="text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>
              {chrome.summaryLabel}
            </div>
            <p style={{ color: 'var(--nav-text-primary)' }}>{summary}</p>
          </div>
          {children}
        </article>

        {/* Visible Q&A: the FAQPage markup in the JSON-LD is built from this very list. */}
        {faq.length > 0 && (
          <section className="guide-prose nav-glass rounded-2xl p-5 lg:p-7 mt-6">
            <h2 style={{ marginTop: 0 }}>{chrome.faqTitle}</h2>
            {faq.map(item => (
              <div key={item.q}>
                <h3 className="text-[15px] font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                  {item.q}
                </h3>
                <p>{item.a}</p>
              </div>
            ))}
          </section>
        )}

        <div className="nav-glass nav-card-accent rounded-2xl p-5 mt-6">
          <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
            {chrome.ctaTitle}
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
            {chrome.ctaBody}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href={`/login?utm_source=bik&utm_medium=cta&utm_campaign=${campaign}`}
              className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
            >
              {chrome.ctaButton}
            </Link>
            <Link href={FEATURES_HREF} className="text-sm font-medium" style={{ color: 'var(--nav-text-secondary)' }}>
              {chrome.ctaLink}
            </Link>
          </div>
        </div>

        {toolCards.length > 0 && (
          <div className="mt-8">
            <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>
              {chrome.relatedTools}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {toolCards.map(c => (
                <Link
                  key={c.slug}
                  href={toolLinkPath(c.slug, lang)}
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
        )}
      </div>
    </div>
  )
}
