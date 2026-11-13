'use client'
import { track } from '@vercel/analytics'
import { useLanguage } from '@/components/LanguageProvider'
import { TOOL_CHROME, type ToolLang } from './index'
import { anonymousToolHref } from './signedInDestination'
import { logToolEvent } from './toolEvents'
import { isToolEventTool } from '@/lib/toolEvents/schema'

// Приглашение в кабинет сразу после созданного документа (13.11.2026). Раньше
// человек, сделавший один документ и ушедший, не видел ни одной кнопки
// регистрации: единственная кнопка в самом инструменте стояла в карточке «лимит
// исчерпан» (после трёх документов), а общая карточка внизу страницы уходит за
// экран. Показывается только анонимному человеку после успешного документа и
// пока лимит не исчерпан (тогда стоит своя карточка лимита). Клик пишется в
// tool_events как cta / after_doc, показы считаются по событиям doc.
//
// Текст честный: реквизиты из документа правда лежат в браузере и в кабинете
// сохраняются одним нажатием (ToolRequisitesOffer в /create). Про тарифы ничего
// не обещаем, КП, акты и накладные в кабинете платные.
export default function ToolAfterDocCard({ source, lang, show }: { source: string; lang: ToolLang; show: boolean }) {
  const { setLang } = useLanguage()
  const t = TOOL_CHROME[lang]
  return (
    <div aria-live="polite">
      {show && (
        <div className="nav-glass nav-card-accent rounded-2xl p-5 mb-4" data-testid="tool-after-doc">
          <div className="text-sm font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.afterDocTitle}</div>
          <p className="text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{t.afterDocBody}</p>
          <a
            href={anonymousToolHref(source, 'after_doc')}
            onClick={() => {
              setLang(lang)
              track('tool_after_doc_click', { source, lang })
              if (isToolEventTool(source)) logToolEvent('cta', source, { lang, medium: 'after_doc' })
            }}
            className="inline-flex items-center justify-center min-h-11 rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
          >
            {t.afterDocButton}
          </a>
        </div>
      )}
    </div>
  )
}
