import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import AvrTool from '../../avr/AvrTool'
import AvrSample, { AvrSampleLink } from '../../avr/AvrSample'
import { avrDict } from '../../avr/dict'

// Языковая версия /tools/avr (kk). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам инструмент — клиентский
// AvrTool. Бланк акта (форма Р-1) — русский на всех языках.
// Схема — docs/tools-i18n-pattern.md.
const LANG = 'kk' as const
const t = avrDict[LANG]

export const metadata: Metadata = toolMetadata('avr', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="avr" lang={LANG} name={t.h1} description={t.seo.description} />
      <AvrSampleLink lang={LANG} />
      <AvrTool lang={LANG}>
        <AvrSample lang={LANG} />
      </AvrTool>
    </>
  )
}
