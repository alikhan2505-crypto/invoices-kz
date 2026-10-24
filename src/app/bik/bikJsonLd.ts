import {
  BIK_BANK_PAGES,
  BIK_PAGES_UPDATED,
  bikBankPath,
  bikHubPath,
  type BikLang,
  type BikRow,
} from '@/lib/bikRegistry'
import { CHROME, bankText, hubText } from './bikContent'

// schema.org graphs for /bik. Rule from the plan: markup only for what is
// visible on the page. No swiftCode property (its presence in schema.org was not
// confirmed), no sameAs (links to bank sites were not verified as profiles).

const ORG = { '@id': 'https://invoices.kz/#organization' }

function crumbs(lang: BikLang, tail?: { name: string; url: string }) {
  const chrome = CHROME[lang]
  const items = [
    { '@type': 'ListItem', position: 1, name: chrome.home, item: 'https://invoices.kz' },
    { '@type': 'ListItem', position: 2, name: chrome.section, item: `https://invoices.kz${bikHubPath(lang)}` },
  ]
  if (tail) items.push({ '@type': 'ListItem', position: 3, name: tail.name, item: tail.url })
  return { '@type': 'BreadcrumbList', itemListElement: items }
}

function faqPage(url: string, lang: BikLang, faq: { q: string; a: string }[]) {
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    inLanguage: CHROME[lang].inLanguage,
    mainEntity: faq.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}

export function hubJsonLd(lang: BikLang) {
  const t = hubText(lang)
  const url = `https://invoices.kz${bikHubPath(lang)}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        url,
        name: t.title,
        description: t.description,
        inLanguage: CHROME[lang].inLanguage,
        dateModified: BIK_PAGES_UPDATED,
        publisher: ORG,
        mainEntity: { '@id': `${url}#banks` },
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#banks`,
        name: t.banks.h2,
        itemListElement: BIK_BANK_PAGES.map((r, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: t.banks.pageLink(r.label!),
          url: `https://invoices.kz${bikBankPath(r.slug!, lang)}`,
        })),
      },
      crumbs(lang),
      faqPage(url, lang, t.faq),
    ],
  }
}

export function bankJsonLd(row: BikRow, lang: BikLang) {
  const t = bankText(row, lang)
  const url = `https://invoices.kz${bikBankPath(row.slug!, lang)}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#page`,
        url,
        name: t.title,
        description: t.description,
        inLanguage: CHROME[lang].inLanguage,
        dateModified: BIK_PAGES_UPDATED,
        publisher: ORG,
        about: {
          '@type': 'BankOrCreditUnion',
          name: row.displayName,
          identifier: { '@type': 'PropertyValue', propertyID: 'BIC', value: row.bik },
        },
      },
      crumbs(lang, { name: t.title, url }),
      faqPage(url, lang, t.faq),
    ],
  }
}
