import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import WaybillsTool from '../../waybills/WaybillsTool'
import { waybillsDict } from '../../waybills/dict'

// Языковая версия /tools/waybills (kk). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам инструмент — клиентский
// WaybillsTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'kk' as const
const t = waybillsDict[LANG]

export const metadata: Metadata = toolMetadata('waybills', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="waybills" lang={LANG} name={t.h1} description={t.seo.description} />
      <WaybillsTool lang={LANG} />
    </>
  )
}
