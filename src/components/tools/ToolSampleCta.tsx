'use client'
import { track } from '@vercel/analytics'
import { logToolEvent } from '@/lib/tools-i18n/toolEvents'
import { isToolEventTool } from '@/lib/toolEvents/schema'
import type { ToolLang } from '@/lib/tools-i18n'
import type { SampleCtaCopy } from '@/lib/tools-i18n/sampleCta'

// Блок под образцом бесплатного инструмента (14.11.2026). Из Search Console видно,
// что на страницу приходят за готовым образцом ("авр образец", "скачать авр рк"):
// человек смотрит образец внизу страницы и уходит, а кнопки после образца не было.
// Кнопка возвращает к форме и ставит курсор в первое поле (БИН). Форму НЕ
// заполняет: вымышленный БИН из нулей в неё попасть не должен. Нажатие пишется в
// tool_events как cta / sample_form.
//
// Клиентский компонент отдельно от серверного ToolSample, чтобы образец остался
// серверным HTML.

interface Props {
  tool: string
  lang: ToolLang
  copy: SampleCtaCopy
  /** id поля формы, куда ставится курсор. */
  targetId: string
}

export default function ToolSampleCta({ tool, lang, copy, targetId }: Props) {
  const go = () => {
    track('tool_sample_cta_click', { source: tool, lang })
    if (isToolEventTool(tool)) logToolEvent('cta', tool, { lang, medium: 'sample_form' })
    const el = document.getElementById(targetId)
    if (!el) return
    let reduce = false
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* старый браузер */ }
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    // Фокус после прокрутки: на iPhone фокус во время плавной прокрутки её обрывает.
    window.setTimeout(() => { try { (el as HTMLElement).focus({ preventScroll: true }) } catch { /* ничего */ } }, reduce ? 0 : 450)
  }
  return (
    <div className="nav-glass nav-card-accent rounded-2xl p-5 mt-4 mb-4" data-testid="tool-sample-cta">
      <div className="text-sm font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{copy.title}</div>
      <p className="text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{copy.body}</p>
      <button
        type="button"
        onClick={go}
        className="inline-flex items-center justify-center min-h-11 w-full sm:w-auto rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
      >
        {copy.button}
      </button>
    </div>
  )
}
