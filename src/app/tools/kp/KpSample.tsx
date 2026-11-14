import ToolSample from '@/components/tools/ToolSample'
import ToolSampleCta from '@/components/tools/ToolSampleCta'
import { sampleCtaCopy, SAMPLE_CTA_TARGET_ID } from '@/lib/tools-i18n/sampleCta'
import type { ToolLang } from '@/lib/tools-i18n'
import { kpDict } from './dict'
import { buildKpSampleDoc, kpGuidePath, kpSampleAnchorLabel, kpSampleCopy, SAMPLE_ANCHOR_ID } from './sample'

// Серверная обёртка блока «Образец» для /tools/kp на трёх языках. Не
// клиентский компонент: страница передаёт его в KpTool как children, так что
// образец попадает в серверный HTML и не утяжеляет браузерный бандл.
/** Казахская версия инструмента: ссылка на неё стоит над формой на русской странице. */
export const KP_KK_PATH = '/tools/kk/kp'
export const KP_KK_LINK_LABEL = 'Коммерческое предложение на казахском языке'

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
      {/* Кнопка под образцом: возвращает к форме (14.11.2026). */}
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
      <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-4 flex flex-wrap gap-x-5 gap-y-1">
        <a href={`#${SAMPLE_ANCHOR_ID}`} className="text-sm font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
          {kpSampleAnchorLabel[lang]}
        </a>
        {/* 14.11.2026: в Search Console есть запрос «коммерческое предложение на казахском» (12 показов, 0 кликов).
            Русская страница ведёт на казахскую версию; текст ссылки русский, вычитка не нужна. */}
        {lang === 'ru' && (
          <a href={KP_KK_PATH} hrefLang="kk" className="text-sm font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
            {KP_KK_LINK_LABEL} →
          </a>
        )}
      </div>
    </div>
  )
}
