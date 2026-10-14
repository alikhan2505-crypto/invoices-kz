import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import NalogiTool from './NalogiTool'
import { nalogiDict, nalogiFaqJsonLd } from './dict'

// Языковая версия /tools/nalogi (ru). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en), schema.org (WebApplication + FAQPage),
// сам калькулятор — клиентский NalogiTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'ru' as const
const t = nalogiDict[LANG]

export const metadata: Metadata = toolMetadata('nalogi', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="nalogi" lang={LANG} name={t.h1} description={t.seo.description} />
      {/* Строка из своего словаря, '<' уже экранирован в nalogiFaqJsonLd. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: nalogiFaqJsonLd(LANG) }} />
      <NalogiTool lang={LANG} />
    </>
  )
}
