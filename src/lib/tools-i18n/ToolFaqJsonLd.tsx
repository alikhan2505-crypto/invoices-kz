import { toolFaqJsonLd, type ToolFaqItem, type ToolLang } from './index'

// Серверный компонент: FAQPage для языковой версии инструмента. Вопросы и
// ответы передаются из того же словаря, что рисует видимый блок FAQ, —
// разметка и текст на странице совпадают слово в слово. toolFaqJsonLd()
// экранирует '<', так что вставка как текст скрипта безопасна.
export default function ToolFaqJsonLd({ slug, lang, items }: {
  slug: string
  lang: ToolLang
  items: ReadonlyArray<ToolFaqItem>
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: toolFaqJsonLd(slug, lang, items) }}
    />
  )
}
