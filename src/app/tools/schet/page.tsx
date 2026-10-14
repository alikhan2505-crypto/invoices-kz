import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import SchetTool from './SchetTool'
import { schetDict, schetFaqJsonLd } from './dict'

// Языковая версия /tools/schet (ru). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en), schema.org (WebApplication + FAQPage),
// сам инструмент — клиентский SchetTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'ru' as const
const t = schetDict[LANG]

export const metadata: Metadata = toolMetadata('schet', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="schet" lang={LANG} name={t.h1} description={t.seo.description} />
      {/* Строка из своего словаря, '<' уже экранирован в schetFaqJsonLd. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schetFaqJsonLd(LANG) }} />
      <SchetTool lang={LANG} />
    </>
  )
}
