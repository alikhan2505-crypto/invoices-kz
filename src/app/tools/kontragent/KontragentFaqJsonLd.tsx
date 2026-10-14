import { toolUrl, TOOL_LOCALE, type ToolLang } from '@/lib/tools-i18n'
import { kontragentDict } from './dict'

/**
 * schema.org FAQPage для языковой версии /tools/kontragent — те же вопросы,
 * что видны на странице (блок «Частые вопросы» в KontragentTool), на языке
 * адреса. Отдельно от общего ToolJsonLd: FAQ есть пока только у этого
 * инструмента, общий помощник не трогаем.
 */
export function kontragentFaqJsonLd(lang: ToolLang): string {
  const { faq } = kontragentDict[lang]
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${toolUrl('kontragent', lang)}#faq`,
    inLanguage: TOOL_LOCALE[lang],
    mainEntity: faq.items.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
  // Только наши собственные строки из словаря, но '<' всё равно экранируем —
  // то же правило, что в toolJsonLd().
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export default function KontragentFaqJsonLd({ lang }: { lang: ToolLang }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: kontragentFaqJsonLd(lang) }} />
}
