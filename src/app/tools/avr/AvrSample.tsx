import ToolSample from '@/components/tools/ToolSample'
import type { ToolLang } from '@/lib/tools-i18n'
import { avrDict } from './dict'
import { avrGuidePath, avrSampleAnchorLabel, avrSampleCopy, buildAvrSampleDoc, SAMPLE_ANCHOR_ID } from './sample'

// Серверная обёртка блока «Образец» для /tools/avr на трёх языках. Не
// клиентский компонент: страница передаёт его в AvrTool как children, так что
// образец попадает в серверный HTML и не утяжеляет браузерный бандл.
export default function AvrSample({ lang }: { lang: ToolLang }) {
  return (
    <ToolSample
      id={SAMPLE_ANCHOR_ID}
      idPrefix="avr-sample"
      copy={avrSampleCopy[lang]}
      doc={buildAvrSampleDoc()}
      guide={{ href: avrGuidePath(lang), label: avrDict[lang].guideLink }}
    />
  )
}

// Ссылка-якорь «Смотреть образец акта ↓» над формой: тем, кто пришёл за
// образцом, не надо листать форму. Серверный компонент, обычный <a href="#…">
// (стандартный переход по фрагменту, без JS), фокусируется с клавиатуры. Фон
// --nav-bg совпадает с фоном инструмента, чтобы не было шва.
export function AvrSampleLink({ lang }: { lang: ToolLang }) {
  return (
    <div style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-4">
        <a href={`#${SAMPLE_ANCHOR_ID}`} className="text-sm font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
          {avrSampleAnchorLabel[lang]}
        </a>
      </div>
    </div>
  )
}
