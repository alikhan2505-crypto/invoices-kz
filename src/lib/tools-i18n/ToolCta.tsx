'use client'
import { track } from '@vercel/analytics'
import { useLanguage } from '@/components/LanguageProvider'
import { TOOL_CHROME, type ToolLang } from './index'
import { anonymousToolHref, signedInToolHref } from './signedInDestination'
import { useToolSession } from './useToolSession'
import { logToolEvent } from './toolEvents'
import { isToolEventTool } from '@/lib/toolEvents/schema'

// Языковая версия src/app/tools/ToolCta.tsx (тот же текст на ru, тот же
// трекинг-эвент tool_cta_click, плюс lang). Клик запоминает язык страницы в
// куке — чтобы /login открылся на том же языке, на котором человек читал.
//
// С 15.10.2026 карточка знает о сессии: вошедшему не «Попробовать бесплатно»
// через /login (основатель-админ так попал в тупик на /upgrade), а «Открыть
// кабинет» прямо на нужную страницу — см. signedInDestination.ts. До монтирования
// (SSR и первый кадр) — всегда анонимный вариант, без расхождения гидратации.
export default function ToolCta({ source, lang }: { source: string; lang: ToolLang }) {
  const { setLang } = useLanguage()
  const t = TOOL_CHROME[lang]
  const { signedIn, kaspiShopAccess } = useToolSession({ withKaspiAccess: source === 'margin' })
  const href = signedIn ? signedInToolHref(source, 'cta', { kaspiShopAccess }) : anonymousToolHref(source, 'cta')
  // Маржа ведёт вошедшего в Kaspi Bot (или на его лендинг), не в кабинет
  // счетов — и текст карточки про бота, а не про счета.
  const isMargin = source === 'margin'
  const signedInBody = !isMargin ? t.ctaSignedInBody : kaspiShopAccess ? t.ctaSignedInKaspiBody : t.ctaSignedInKaspiLandingBody
  const signedInButton = !isMargin ? t.ctaSignedInButton : kaspiShopAccess ? t.ctaSignedInKaspiButton : t.ctaSignedInKaspiLandingButton
  return (
    <div className="nav-glass rounded-2xl p-5 mt-6">
      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
        {signedIn ? t.ctaSignedInTitle : t.ctaTitle}
      </div>
      <p className="text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
        {signedIn ? signedInBody : t.ctaBody}
      </p>
      <a
        href={href}
        onClick={() => {
          setLang(lang); track('tool_cta_click', { source, lang, signedIn })
          if (isToolEventTool(source)) logToolEvent('cta', source, { lang, medium: 'cta' })
        }}
        className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
      >
        {signedIn ? signedInButton : t.ctaButton}
      </a>
    </div>
  )
}
