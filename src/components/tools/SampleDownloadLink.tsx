'use client'
import { track } from '@vercel/analytics'
import { logToolEvent } from '@/lib/tools-i18n/toolEvents'
import { isToolEventTool } from '@/lib/toolEvents/schema'
import type { ToolLang } from '@/lib/tools-i18n'
import type { SampleDownloadFile } from '@/lib/tools-i18n/sampleDownload'

// Ссылка на готовый PDF-образец (15.11.2026). Обычный <a href download>: файл
// скачивается и без JavaScript. Клиентский компонент нужен только для счётчика:
// нажатие пишется в tool_events как cta / sample_download (со страниц инструментов)
// или cta / sample_guide (из гайда).
//
// variant 'button' - заметная кнопка рядом с образцом, 'link' - строка над формой.

interface Props {
  tool: string
  lang: ToolLang
  file: SampleDownloadFile
  label: string
  variant: 'button' | 'link'
  /** Откуда нажали: для счётчика Vercel (в tool_events пишется один medium). */
  place: 'top' | 'sample' | 'guide'
}

export default function SampleDownloadLink({ tool, lang, file, label, variant, place }: Props) {
  const onClick = () => {
    track('tool_sample_download_click', { source: tool, lang, place })
    if (isToolEventTool(tool)) logToolEvent('cta', tool, { lang, medium: place === 'guide' ? 'sample_guide' : 'sample_download' })
  }
  if (variant === 'link') {
    return (
      <a
        href={file.href}
        download={file.fileName}
        onClick={onClick}
        data-testid={`sample-download-${place}`}
        className="text-sm font-semibold underline-offset-2 hover:underline"
        style={{ color: 'var(--nav-accent)' }}
      >
        {label}
      </a>
    )
  }
  return (
    <a
      href={file.href}
      download={file.fileName}
      onClick={onClick}
      data-testid={`sample-download-${place}`}
      className="inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold"
      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', touchAction: 'manipulation' }}
    >
      {label}
    </a>
  )
}
