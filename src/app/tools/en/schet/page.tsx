import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import SchetTool from '../../schet/SchetTool'
import SchetSample, { SchetSampleLink } from '../../schet/SchetSample'
import { schetDict, schetFaqJsonLd } from '../../schet/dict'

// Языковая версия /tools/schet (en). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en), schema.org (WebApplication + FAQPage),
// сам инструмент — клиентский SchetTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'en' as const
const t = schetDict[LANG]

export const metadata: Metadata = toolMetadata('schet', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="schet" lang={LANG} name={t.h1} description={t.seo.description} />
      {/* Строка из своего словаря, '<' уже экранирован в schetFaqJsonLd. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schetFaqJsonLd(LANG) }} />
      <SchetSampleLink lang={LANG} />
      <SchetTool lang={LANG}>
        <SchetSample lang={LANG} />
      </SchetTool>
    </>
  )
}
