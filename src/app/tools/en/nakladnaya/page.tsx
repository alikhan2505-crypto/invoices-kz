import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import NakladnayaTool from '../../nakladnaya/NakladnayaTool'
import NakladnayaSample, { NakladnayaSampleLink } from '../../nakladnaya/NakladnayaSample'
import { nakladnayaDict } from '../../nakladnaya/dict'

// Языковая версия /tools/nakladnaya (en). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам инструмент — клиентский
// NakladnayaTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'en' as const
const t = nakladnayaDict[LANG]

export const metadata: Metadata = toolMetadata('nakladnaya', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="nakladnaya" lang={LANG} name={t.h1} description={t.seo.description} />
      <NakladnayaSampleLink lang={LANG} />
      <NakladnayaTool lang={LANG}>
        <NakladnayaSample lang={LANG} />
      </NakladnayaTool>
    </>
  )
}
