import ToolSample from '@/components/tools/ToolSample'
import type { ToolLang } from '@/lib/tools-i18n'
import { schetDict } from './dict'
import { buildSchetSampleDoc, schetGuidePath, schetSampleAnchorLabel, schetSampleCopy, SAMPLE_ANCHOR_ID } from './sample'

// Серверная обёртка блока «Образец» для /tools/schet на трёх языках. Не
// клиентский компонент: страница передаёт его в SchetTool как children, так что
// образец попадает в серверный HTML и не утяжеляет браузерный бандл.
export default function SchetSample({ lang }: { lang: ToolLang }) {
  return (
    <ToolSample
      id={SAMPLE_ANCHOR_ID}
      idPrefix="sc-sample"
      copy={schetSampleCopy[lang]}
      doc={buildSchetSampleDoc()}
      guide={{ href: schetGuidePath(lang), label: schetDict[lang].guideLink }}
    />
  )
}

// Ссылка-якорь «Смотреть образец счёта ↓» над формой: тем, кто пришёл за
// образцом, не надо листать форму. Серверный компонент, обычный <a href="#…">
// (стандартный переход по фрагменту, без JS и без scroll-behavior), фокусируется
// с клавиатуры. Фон --nav-bg совпадает с фоном инструмента, чтобы не было шва.
export function SchetSampleLink({ lang }: { lang: ToolLang }) {
  return (
    <div style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-4">
        <a href={`#${SAMPLE_ANCHOR_ID}`} className="text-sm font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
          {schetSampleAnchorLabel[lang]}
        </a>
      </div>
    </div>
  )
}
