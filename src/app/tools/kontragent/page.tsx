import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import KontragentFaqJsonLd from './KontragentFaqJsonLd'
import KontragentTool from './KontragentTool'
import { kontragentDict } from './dict'

// Языковая версия /tools/kontragent (ru). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам инструмент — клиентский
// KontragentTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'ru' as const
const t = kontragentDict[LANG]

export const metadata: Metadata = toolMetadata('kontragent', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="kontragent" lang={LANG} name={t.h1} description={t.seo.description} />
      <KontragentFaqJsonLd lang={LANG} />
      <KontragentTool lang={LANG} />
    </>
  )
}
