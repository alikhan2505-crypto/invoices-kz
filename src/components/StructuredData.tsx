import { PLAN_PRICES } from '@/lib/plans/pricing'
import { PRICING_URL } from '@/lib/landings'

// Machine-readable description of the platform for Google and Yandex
// (schema.org JSON-LD). The site had none at all before 2026-09-05, so
// search engines had only the prose on the page to work out what this is,
// what it costs and who publishes it.
//
// Prices are read from PLAN_PRICES rather than typed out, so a tariff
// change can't silently leave a stale number in search results -- that
// single source already exists precisely to stop amounts drifting.
export default function StructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://invoices.kz/#organization',
        name: 'INVOICES.KZ',
        // Реквизиты оператора -- ровно те, что уже опубликованы в подвале хаба,
        // на лендинге Счетов и в /privacy, /terms (ИП First Project, БИН, Астана,
        // mail@ и WhatsApp из раздела «Контакты»). Ничего сверх опубликованного.
        legalName: 'ИП First Project',
        taxID: '890525350143',
        url: 'https://invoices.kz',
        logo: 'https://invoices.kz/icon-192.png',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Астана',
          addressCountry: 'KZ',
        },
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: 'mail@invoices.kz',
            telephone: '+7 776 355 51 77',
            availableLanguage: ['Russian', 'Kazakh', 'English'],
            areaServed: 'KZ',
          },
        ],
        areaServed: { '@type': 'Country', name: 'Kazakhstan' },
        sameAs: ['https://www.instagram.com/invoices.kz/'],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://invoices.kz/#website',
        url: 'https://invoices.kz',
        name: 'INVOICES.KZ',
        inLanguage: 'ru-KZ',
        publisher: { '@id': 'https://invoices.kz/#organization' },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://invoices.kz/#software',
        name: 'INVOICES.KZ',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: ['ru', 'kk'],
        description:
          'Платформа для бизнеса Казахстана: счета, АВР, накладные и КП с оплатой через Kaspi Pay, ' +
          'демпинг-бот и публичная витрина для Kaspi Магазина, AI-агент для ответов клиентам ' +
          'и ЭЦП для документов — с единым кошельком.',
        publisher: { '@id': 'https://invoices.kz/#organization' },
        featureList: [
          'Счета, АВР, накладные и коммерческие предложения',
          'Приём оплаты через Kaspi Pay (QR и ссылка)',
          'Демпинг-бот для Kaspi Магазина с защитой минимальной цены',
          'Публичная витрина магазина с корзиной',
          'AI-агент для WhatsApp, Telegram, Instagram и сайта',
          'Подписание документов ЭЦП',
        ],
        offers: [
          {
            '@type': 'Offer',
            name: 'Базовый',
            price: String(PLAN_PRICES.basic.monthly),
            priceCurrency: 'KZT',
            category: 'monthly subscription',
            url: PRICING_URL,
          },
          {
            '@type': 'Offer',
            name: 'Pro',
            price: String(PLAN_PRICES.pro.monthly),
            priceCurrency: 'KZT',
            category: 'monthly subscription',
            url: PRICING_URL,
          },
        ],
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is data, not markup; "<" is escaped so a value
      // can never break out of the script element.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
