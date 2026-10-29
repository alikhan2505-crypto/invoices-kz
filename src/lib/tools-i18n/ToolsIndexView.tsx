import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import KkReviewNotice from '@/components/KkReviewNotice'
import ToolLangSwitch from './ToolLangSwitch'
import { guidesIndexPath, isToolLocalized, toolLinkPath, toolsIndexPath, type ToolLang } from './index'
import { toolsIndexDict, toolsIndexJsonLd } from './toolsIndex'

const INDEX_HREFS: Readonly<Record<ToolLang, string>> = {
  ru: toolsIndexPath('ru'),
  kk: toolsIndexPath('kk'),
  en: toolsIndexPath('en'),
}

// Индекс бесплатных инструментов — один серверный компонент на три адреса
// (/tools, /tools/kk, /tools/en). Карточки ведут на языковую версию
// инструмента, а если её пока нет — на русскую с пометкой «орысша»/«in Russian».
export default function ToolsIndexView({ lang }: { lang: ToolLang }) {
  const t = toolsIndexDict[lang]
  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      {/* Строка из своего словаря, '<' уже экранирован в toolsIndexJsonLd. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toolsIndexJsonLd(lang) }} />
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <BrandWordmark height={15} />
          <ToolLangSwitch lang={lang} hrefs={INDEX_HREFS} />
        </div>

        {/* Плашка «текст проверяется» (реестр: src/lib/kkReview.ts): под шапкой, над заголовком; для ru/en и вне реестра её нет. */}
        {lang === 'kk' && <KkReviewNotice className="mb-4 sm:mb-5" />}

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          {t.h1}
        </h1>
        <p className="text-sm mb-7" style={{ color: 'var(--nav-text-secondary)' }}>
          {t.intro}
        </p>

        {t.groups.map(g => (
          <section key={g.title} className="mb-7">
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
              {g.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.tools.map(c => {
                const ruOnly = lang !== 'ru' && !isToolLocalized(c.slug)
                return (
                  <Link
                    key={c.slug}
                    href={toolLinkPath(c.slug, lang)}
                    hrefLang={ruOnly ? 'ru' : lang}
                    className="nav-glass rounded-2xl p-5 block"
                    style={{ color: 'var(--nav-text-primary)' }}
                  >
                    <div className="text-base font-semibold mb-1.5">
                      {c.title}
                      {ruOnly && (
                        <span
                          className="ml-2 inline-block whitespace-nowrap align-middle text-[11px] font-semibold rounded-full px-2 py-0.5"
                          style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-secondary)' }}
                        >
                          {t.ruOnly}
                        </span>
                      )}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{c.text}</div>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}

        <div className="mt-2">
          <Link href={guidesIndexPath(lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
            {t.guidesLink}
          </Link>
        </div>
      </div>
    </div>
  )
}
