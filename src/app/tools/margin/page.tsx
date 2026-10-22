import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import ToolFaqJsonLd from '@/lib/tools-i18n/ToolFaqJsonLd'
import MarginTool from './MarginTool'
import { marginDict } from './dict'

// Языковая версия /tools/margin (ru). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам калькулятор — клиентский
// MarginTool. Схема — docs/tools-i18n-pattern.md. Прежний layout.tsx, который
// держал только metadata (страница была клиентской), удалён.
const LANG = 'ru' as const
const t = marginDict[LANG]

export const metadata: Metadata = toolMetadata('margin', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="margin" lang={LANG} name={t.h1} description={t.seo.description} />
      <ToolFaqJsonLd slug="margin" lang={LANG} items={t.faq} />
      <MarginTool lang={LANG} />
    </>
  )
}
