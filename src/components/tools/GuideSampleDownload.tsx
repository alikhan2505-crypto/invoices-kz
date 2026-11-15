import SampleDownloadLink from '@/components/tools/SampleDownloadLink'
import type { ToolLang } from '@/lib/tools-i18n'
import { sampleDownload } from '@/lib/tools-i18n/sampleDownload'

// Кнопка «Скачать образец PDF» внутри гайда про накладную З-2 (15.11.2026).
// Гайд собирает запросы «образец З-2», «форма 3-2», «приложение 26», но образца в нём
// не было, только ссылка в генератор. Готовый PDF накладной (public/samples) это та же
// форма З-2 по приложению 26 к приказу № 562, поэтому отдельный файл не нужен.
// Тексты те же, что на страницах инструмента (вычитаны основателем 15.11.2026), новых
// строк нет. Событие аналитики cta / sample_guide, отдельно от sample_download.

export default function GuideSampleDownload({ lang }: { lang: ToolLang }) {
  const dl = sampleDownload('nakladnaya', lang)
  if (!dl) return null
  return (
    <div
      className="not-prose my-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl p-4"
      style={{ border: '1px solid var(--nav-border)', background: 'var(--nav-surface-chrome)' }}
      data-testid="guide-sample-download"
    >
      <SampleDownloadLink tool="nakladnaya" lang={lang} file={dl.file} label={dl.copy.button} variant="button" place="guide" />
      <span className="text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>{dl.copy.hint}</span>
    </div>
  )
}
