import ToolSample from '@/components/tools/ToolSample'
import ToolSampleCta from '@/components/tools/ToolSampleCta'
import { sampleCtaCopy, SAMPLE_CTA_TARGET_ID } from '@/lib/tools-i18n/sampleCta'
import type { ToolLang } from '@/lib/tools-i18n'
import { kpDict } from './dict'
import { buildKpSampleDoc, kpGuidePath, kpSampleAnchorLabel, kpSampleCopy, SAMPLE_ANCHOR_ID } from './sample'

// Серверная обёртка блока «Образец» для /tools/kp на трёх языках. Не
// клиентский компонент: страница передаёт его в KpTool как children, так что
// образец попадает в серверный HTML и не утяжеляет браузерный бандл.
export default function KpSample({ lang }: { lang: ToolLang }) {
  const cta = sampleCtaCopy('kp', lang)
  return (
    <>
      <ToolSample
        id={SAMPLE_ANCHOR_ID}
        idPrefix="kp-sample"
        copy={kpSampleCopy[lang]}
        doc={buildKpSampleDoc(lang)}
        docLang={lang}
        guide={{ href: kpGuidePath(lang), label: kpDict[lang].guideLink }}
      />
      {/* Кнопка под образцом: возвращает к форме (14.11.2026). На kk её нет до вычитки текста. */}
      {cta && <ToolSampleCta tool="kp" lang={lang} copy={cta} targetId={SAMPLE_CTA_TARGET_ID.kp} />}
    </>
  )
}

// Ссылка-якорь «Смотреть образец КП ↓» над формой: тем, кто пришёл за
// образцом, не надо листать форму. Серверный компонент, обычный <a href="#…">
// (стандартный переход по фрагменту, без JS), фокусируется с клавиатуры. Фон
// --nav-bg совпадает с фоном инструмента, чтобы не было шва.
export function KpSampleLink({ lang }: { lang: ToolLang }) {
  return (
    <div style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-4">
        <a href={`#${SAMPLE_ANCHOR_ID}`} className="text-sm font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
          {kpSampleAnchorLabel[lang]}
        </a>
      </div>
    </div>
  )
}
