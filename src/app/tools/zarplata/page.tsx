import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import ToolFaqJsonLd from '@/lib/tools-i18n/ToolFaqJsonLd'
import ZarplataTool from './ZarplataTool'
import { zarplataDict } from './dict'

// Языковая версия /tools/zarplata (ru). Серверная обёртка: metadata
// (canonical + hreflang ru/kk/en), schema.org (WebApplication + FAQPage),
// сам калькулятор это клиентский ZarplataTool. Схема: docs/tools-i18n-pattern.md.
// Картинка превью пока общая с /tools/nalogi (отдельную tool-zarplata.png ещё
// не нарисовали): четвёртый аргумент toolMetadata.
const LANG = 'ru' as const
const t = zarplataDict[LANG]

export const metadata: Metadata = toolMetadata('zarplata', LANG, t.seo, '/og/tool-nalogi.png')

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="zarplata" lang={LANG} name={t.h1} description={t.seo.description} />
      <ToolFaqJsonLd slug="zarplata" lang={LANG} items={t.faq} />
      <ZarplataTool lang={LANG} />
    </>
  )
}
