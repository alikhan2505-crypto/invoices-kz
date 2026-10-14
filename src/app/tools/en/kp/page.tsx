import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import KpTool from '../../kp/KpTool'
import { kpDict } from '../../kp/dict'

// Языковая версия /tools/kp (en). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам инструмент — клиентский
// KpTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'en' as const
const t = kpDict[LANG]

export const metadata: Metadata = toolMetadata('kp', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="kp" lang={LANG} name={t.h1} description={t.seo.description} />
      <KpTool lang={LANG} />
    </>
  )
}
