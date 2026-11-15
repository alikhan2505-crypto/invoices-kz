'use client'
import { track } from '@vercel/analytics'
import { isToolEventTool } from '@/lib/toolEvents/schema'
import { buildHandoff, DOC_NEXT, saveHandoff, toolPagePath, type DocTool } from './docHandoff'
import { nextDocCopy } from './nextDoc'
import { logToolEvent } from './toolEvents'
import type { ToolLang } from './index'

// Карточка после созданного документа (15.11.2026): ведёт к следующему документу
// с теми же клиентом, позициями и НДС. Перенос пишется в sessionStorage только в
// момент клика (docHandoff.ts). Показывается после любого документа, и вошедшему,
// и анонимному; приглашение в кабинет (ToolAfterDocCard) стоит выше и не меняется.
// Клик пишется в tool_events как cta / next_doc.

type FormForHandoff = Parameters<typeof buildHandoff>[2]

export default function ToolNextDocCard({ source, lang, show, getForm }: { source: DocTool; lang: ToolLang; show: boolean; getForm: () => FormForHandoff }) {
  const copy = nextDocCopy(lang)
  if (!show || !copy) return <div aria-live="polite" />
  return (
    <div aria-live="polite">
      <div className="nav-glass rounded-2xl p-5 mb-4" data-testid="tool-next-doc">
        <div className="text-sm font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{copy.title}</div>
        <p className="text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{copy.body}</p>
        <div className="flex flex-wrap gap-2">
          {DOC_NEXT[source].map(target => (
            <a
              key={target}
              href={toolPagePath(target, lang)}
              data-testid={`tool-next-doc-${target}`}
              onClick={() => {
                saveHandoff(buildHandoff(source, target, getForm()))
                track('tool_next_doc_click', { source, target, lang })
                if (isToolEventTool(source)) logToolEvent('cta', source, { lang, medium: 'next_doc' })
              }}
              className="inline-flex items-center justify-center min-h-11 rounded-xl px-5 py-2.5 text-sm font-semibold"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', touchAction: 'manipulation' }}
            >
              {copy.buttons[target]} →
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
