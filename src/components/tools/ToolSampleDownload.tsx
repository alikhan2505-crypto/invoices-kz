import SampleDownloadLink from '@/components/tools/SampleDownloadLink'
import type { ToolLang } from '@/lib/tools-i18n'
import type { SampleCtaTool } from '@/lib/tools-i18n/sampleCta'
import { sampleDownload } from '@/lib/tools-i18n/sampleDownload'

// Серверная обёртка ссылки «Скачать образец PDF» над формой (15.11.2026). Кнопку рядом с
// образцом рисует переключатель НДС (ToolSampleSwitch), чтобы файл совпадал с показанным.
// Пустой результат (null), если для языка текста нет: на /tools/kk/* до вычитки ссылки нет.

/** Короткая ссылка рядом со ссылкой «Смотреть образец ↓» над формой. */
export function SampleDownloadTopLink({ tool, lang }: { tool: SampleCtaTool; lang: ToolLang }) {
  const dl = sampleDownload(tool, lang)
  if (!dl) return null
  return <SampleDownloadLink tool={tool} lang={lang} file={dl.file} label={dl.copy.link} variant="link" place="top" />
}
