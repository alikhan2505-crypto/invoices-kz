import type { Metadata } from 'next'
import Link from 'next/link'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import ToolFaqJsonLd from '@/lib/tools-i18n/ToolFaqJsonLd'
import WaybillsTool from '../../waybills/WaybillsTool'
import { waybillsDict } from '../../waybills/dict'

// Языковая версия /tools/waybills (en). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en) и schema.org, сам инструмент — клиентский
// WaybillsTool. Схема — docs/tools-i18n-pattern.md.
const LANG = 'en' as const
const t = waybillsDict[LANG]

export const metadata: Metadata = toolMetadata('waybills', LANG, t.seo, '/og/tool-waybills.png?v=2') // v=2: «5 в месяц» вместо «без регистрации» — сброс кэша превью соцсетей

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="waybills" lang={LANG} name={t.h1} description={t.seo.description} />
      <ToolFaqJsonLd slug="waybills" lang={LANG} items={t.faq} />
      <WaybillsTool lang={LANG} />
      {/* Guides exist in Russian and Kazakh only, so the link says so. Server markup: visible to crawlers without JS. */}
      <div style={{ background: 'var(--nav-bg)' }}>
        <div className="max-w-2xl mx-auto px-4 lg:px-6 pb-10">
          <Link
            href="/guides/nakladnye-kaspi-odnim-pdf"
            hrefLang="ru"
            className="text-sm font-semibold"
            style={{ color: 'var(--nav-accent)' }}
          >
            Step-by-step guide on merging Kaspi waybills into one PDF (in Russian) →
          </Link>
        </div>
      </div>
    </>
  )
}
