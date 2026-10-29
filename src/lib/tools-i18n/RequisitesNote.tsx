'use client'
import type { ToolLang } from './index'
import { FORM_TEXT } from './moreFields'

// Строка под блоком поставщика: «реквизиты запомнены только в этом браузере»
// и ссылка «Очистить сохранённые реквизиты». Видна, только пока что-то сохранено.
export default function RequisitesNote({ lang, visible, onClear }: { lang: ToolLang; visible: boolean; onClear: () => void }) {
  if (!visible) return null
  const t = FORM_TEXT[lang]
  return (
    <p className="text-[11px] mt-2 leading-snug sm:col-span-2" style={{ color: 'var(--nav-text-muted)' }}>
      {t.requisitesSaved}
      <button type="button" onClick={onClear} className="block underline py-2 -mb-2 text-left" style={{ color: 'var(--nav-text-secondary)' }}>
        {t.requisitesClear}
      </button>
    </p>
  )
}
