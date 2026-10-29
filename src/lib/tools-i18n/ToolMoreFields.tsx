'use client'
import { useId, useRef, useState, type ReactNode } from 'react'
import { track } from '@vercel/analytics'
import type { ToolEventTool } from '@/lib/toolEvents/schema'
import type { ToolLang } from './index'
import { FORM_TEXT, moreExpanded, nextMoreState, type MoreState } from './moreFields'
import { logToolEvent } from './toolEvents'

// «Дополнительно» в формах бесплатных документов /tools (29.10.2026). Сворачивается
// ТОЛЬКО на телефоне (ниже sm, 640 px): с sm и шире все поля на виду, как раньше,
// а кнопка скрыта. Три части, чтобы форма сама решала, где что лежит:
//   useMoreFields - состояние (раскрыт ли блок, событие аналитики);
//   MoreToggle    - кнопка с aria-expanded/aria-controls, цель касания 44 px;
//   MorePanel     - обёртка полей (display: contents, не ломает сетку родителя);
//                   свёрнутые поля скрыты через display:none, но остаются в DOM,
//                   поэтому введённое и автозаполнение браузера живут.
// Раскрыт сам, если внутри есть значение (forceOpen: черновик, запомненные
// реквизиты) или ошибка валидации (hasError); автораскрытие липкое (moreFields.ts).

export interface MoreFieldsState {
  expanded: boolean
  toggle: () => void
  panelId: string
}

export function useMoreFields(opts: {
  tool: ToolEventTool
  lang: ToolLang
  forceOpen: boolean
  hasError?: boolean
}): MoreFieldsState {
  const { tool, lang, forceOpen, hasError = false } = opts
  const panelId = `${useId()}-more`
  const [manual, setManual] = useState<MoreState>(null)
  // Липкое автораскрытие считаем прямо в рендере (производное состояние).
  const next = nextMoreState(manual, forceOpen)
  if (next !== manual) setManual(next)
  const expanded = moreExpanded(next, hasError)
  const reported = useRef(false)
  const toggle = () => {
    const open = !expanded
    setManual(open)
    if (open && !reported.current) {
      reported.current = true
      track('tool_form_more_open', { tool, lang })
      logToolEvent('tool_form_more_open', tool, { lang })
    }
  }
  return { expanded, toggle, panelId }
}

export function MoreToggle({ m, lang, hint, className = '' }: { m: MoreFieldsState; lang: ToolLang; hint: string; className?: string }) {
  const t = FORM_TEXT[lang]
  return (
    <button type="button" onClick={m.toggle} aria-expanded={m.expanded} aria-controls={m.panelId}
      className={`sm:hidden w-full min-h-[44px] flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${className}`}
      style={{ border: '1px solid var(--nav-border)', background: 'transparent' }}>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold" style={{ color: 'var(--nav-accent)' }}>{t.more}</span>
        {hint && <span className="block text-[11px] leading-snug" style={{ color: 'var(--nav-text-muted)' }}>{hint}</span>}
      </span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0"
        style={{ color: 'var(--nav-text-muted)', transform: m.expanded ? 'rotate(180deg)' : 'none' }}>
        <path d="M3.5 6l4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

/** Без className панель прозрачна для сетки родителя (contents); с className сама становится контейнером. */
export function MorePanel({ m, className, children }: { m: MoreFieldsState; className?: string; children: ReactNode }) {
  return <div id={m.panelId} className={`${className ?? 'contents'} ${m.expanded ? '' : 'max-sm:hidden'}`}>{children}</div>
}
