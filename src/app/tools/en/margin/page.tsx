import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import MarginTool from '../../margin/MarginTool'
import { marginDict } from '../../margin/dict'

// Языковая версия /tools/margin (en). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам калькулятор — клиентский
// MarginTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'en' as const
const t = marginDict[LANG]

export const metadata: Metadata = toolMetadata('margin', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="margin" lang={LANG} name={t.h1} description={t.seo.description} />
      <MarginTool lang={LANG} />
    </>
  )
}
