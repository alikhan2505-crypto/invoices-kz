import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import KpTool from '../../kp/KpTool'
import KpSample, { KpSampleLink } from '../../kp/KpSample'
import { kpDict } from '../../kp/dict'

// Языковая версия /tools/kp (kk). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам инструмент — клиентский
// KpTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'kk' as const
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
