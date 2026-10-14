'use client'
import { track } from '@vercel/analytics'
import { useLanguage } from '@/components/LanguageProvider'
import { TOOL_CHROME, type ToolLang } from './index'

// Языковая версия src/app/tools/ToolCta.tsx (тот же текст на ru, тот же
// трекинг-эвент tool_cta_click, плюс lang). Клик запоминает язык страницы в
// куке — чтобы /login открылся на том же языке, на котором человек читал.
export default function ToolCta({ source, lang }: { source: string; lang: ToolLang }) {
  const { setLang } = useLanguage()
  const t = TOOL_CHROME[lang]
  return (
    <div className="nav-glass rounded-2xl p-5 mt-6">
      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
        {t.ctaTitle}
      </div>
      <p className="text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
        {t.ctaBody}
      </p>
      <a
        href={`/login?utm_source=tools&utm_medium=cta&utm_campaign=${source}`}
        onClick={() => { setLang(lang); track('tool_cta_click', { source, lang }) }}
        className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
      >
        {t.ctaButton}
      </a>
    </div>
  )
}
