import ToolSample from '@/components/tools/ToolSample'
import ToolSampleCta from '@/components/tools/ToolSampleCta'
import SampleDownloadLink from '@/components/tools/SampleDownloadLink'
import type { ToolLang } from '@/lib/tools-i18n'
import { avrDict } from './dict'
import { sampleCtaCopy, SAMPLE_CTA_TARGET_ID } from '@/lib/tools-i18n/sampleCta'
import { sampleDownload } from '@/lib/tools-i18n/sampleDownload'
import { avrGuidePath, avrSampleAnchorLabel, avrSampleCopy, buildAvrSampleDoc, SAMPLE_ANCHOR_ID } from './sample'

// Серверная обёртка блока «Образец» для /tools/avr на трёх языках. Не
// клиентский компонент: страница передаёт его в AvrTool как children, так что
// образец попадает в серверный HTML и не утяжеляет браузерный бандл.
export default function AvrSample({ lang }: { lang: ToolLang }) {
  const cta = sampleCtaCopy('avr', lang)
  const dl = sampleDownload('avr', lang)
  return (
    <>
      <ToolSample
        id={SAMPLE_ANCHOR_ID}
        idPrefix="avr-sample"
        copy={avrSampleCopy[lang]}
        doc={buildAvrSampleDoc()}
        guide={{ href: avrGuidePath(lang), label: avrDict[lang].guideLink }}
        download={dl && (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <SampleDownloadLink tool="avr" lang={lang} file={dl.file} label={dl.copy.button} variant="button" place="sample" />
            <span className="text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>{dl.copy.hint}</span>
          </div>
        )}
      />
      {/* Кнопка под образцом: возвращает к форме (макет согласован 14.11.2026). */}
      {cta && <ToolSampleCta tool="avr" lang={lang} copy={cta} targetId={SAMPLE_CTA_TARGET_ID.avr} />}
    </>
  )
}

// Ссылка-якорь «Смотреть образец акта ↓» над формой: тем, кто пришёл за
// образцом, не надо листать форму. Серверный компонент, обычный <a href="#…">
// (стандартный переход по фрагменту, без JS), фокусируется с клавиатуры. Фон
// --nav-bg совпадает с фоном инструмента, чтобы не было шва.
export function AvrSampleLink({ lang }: { lang: ToolLang }) {
  const dl = sampleDownload('avr', lang)
  return (
    <div style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-4 flex flex-wrap gap-x-5 gap-y-1">
        <a href={`#${SAMPLE_ANCHOR_ID}`} className="text-sm font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
          {avrSampleAnchorLabel[lang]}
        </a>
        {dl && <SampleDownloadLink tool="avr" lang={lang} file={dl.file} label={dl.copy.link} variant="link" place="top" />}
      </div>
    </div>
  )
}
