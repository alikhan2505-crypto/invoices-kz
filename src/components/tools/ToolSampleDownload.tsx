import SampleDownloadLink from '@/components/tools/SampleDownloadLink'
import type { ToolLang } from '@/lib/tools-i18n'
import type { SampleCtaTool } from '@/lib/tools-i18n/sampleCta'
import { sampleDownload } from '@/lib/tools-i18n/sampleDownload'

// Серверные обёртки «Скачать образец PDF» для четырёх инструментов (15.11.2026).
// Пустой результат (null), если для инструмента и языка файла или текста нет:
// например, на /tools/kk/* до вычитки казахского текста кнопки нет.

/** Кнопка с пояснением над бланком в блоке «Образец». */
export function SampleDownloadButton({ tool, lang }: { tool: SampleCtaTool; lang: ToolLang }) {
  const dl = sampleDownload(tool, lang)
  if (!dl) return null
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <SampleDownloadLink tool={tool} lang={lang} file={dl.file} label={dl.copy.button} variant="button" place="sample" />
      <span className="text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>{dl.copy.hint}</span>
    </div>
  )
}

/** Короткая ссылка рядом со ссылкой «Смотреть образец ↓» над формой. */
export function SampleDownloadTopLink({ tool, lang }: { tool: SampleCtaTool; lang: ToolLang }) {
  const dl = sampleDownload(tool, lang)
  if (!dl) return null
  return <SampleDownloadLink tool={tool} lang={lang} file={dl.file} label={dl.copy.link} variant="link" place="top" />
}
