import ToolSample from '@/components/tools/ToolSample'
import { toolGuidePath, type ToolLang } from '@/lib/tools-i18n'
import { nakladnayaDict } from './dict'
import { buildNakladnayaSampleDoc, nakladnayaSampleAnchorLabel, nakladnayaSampleCopy, SAMPLE_ANCHOR_ID } from './sample'

// Гайд «Счёт, АВР, накладная и КП»: ru и kk есть, английского нет (en → русский).
// Тот же slug и тот же путь, что у ссылки внизу NakladnayaTool.
export const NAKLADNAYA_GUIDE_SLUG = 'dokumenty-ip-kazakhstan'

// Серверная обёртка блока «Образец» для /tools/nakladnaya на трёх языках. Не
// клиентский компонент: страница передаёт его в NakladnayaTool как children, так
// что образец попадает в серверный HTML и не утяжеляет браузерный бандл.
export default function NakladnayaSample({ lang }: { lang: ToolLang }) {
  return (
    <ToolSample
      id={SAMPLE_ANCHOR_ID}
      idPrefix="nk-sample"
      copy={nakladnayaSampleCopy[lang]}
      doc={buildNakladnayaSampleDoc()}
      guide={{ href: toolGuidePath(NAKLADNAYA_GUIDE_SLUG, lang), label: nakladnayaDict[lang].guideLink }}
    />
  )
}

// Ссылка-якорь «Смотреть образец накладной ↓» над формой: тем, кто пришёл за
// образцом, не надо листать форму. Серверный компонент, обычный <a href="#…">
// (стандартный переход по фрагменту, без JS и без scroll-behavior), фокусируется
// с клавиатуры. Фон --nav-bg совпадает с фоном инструмента, чтобы не было шва.
export function NakladnayaSampleLink({ lang }: { lang: ToolLang }) {
  return (
    <div style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-4">
        <a href={`#${SAMPLE_ANCHOR_ID}`} className="text-sm font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
          {nakladnayaSampleAnchorLabel[lang]}
        </a>
      </div>
    </div>
  )
}
