import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import KpTool from './KpTool'
import KpSample, { KpSampleLink } from './KpSample'
import { kpDict } from './dict'

// Языковая версия /tools/kp (ru). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам инструмент — клиентский
// KpTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'ru' as const
const t = kpDict[LANG]

export const metadata: Metadata = toolMetadata('kp', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="kp" lang={LANG} name={t.h1} description={t.seo.description} />
      <KpSampleLink lang={LANG} />
      <KpTool lang={LANG}>
        <KpSample lang={LANG} />
      </KpTool>
    </>
  )
}
