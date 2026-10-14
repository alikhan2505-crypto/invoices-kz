import { toolJsonLd, type ToolLang } from './index'

// Серверный компонент: schema.org для языковой версии инструмента. Данные —
// только наши собственные строки из словаря, и toolJsonLd() уже экранирует
// '<', так что вставка как текст скрипта безопасна (то же правило, что в
// GuideShell / StructuredData).
export default function ToolJsonLd({ slug, lang, name, description }: {
  slug: string
  lang: ToolLang
  name: string
  description: string
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: toolJsonLd(slug, lang, name, description) }}
    />
  )
}
