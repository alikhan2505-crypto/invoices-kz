import type { Metadata } from 'next'

// Как у /tools/margin: страница — клиентский компонент, метаданные живут в
// layout. Этот инструмент существует, чтобы его находили по «счёт на оплату
// образец/скачать/онлайн» — самому частотному документному запросу ИП.
export const metadata: Metadata = {
  title: 'Счёт на оплату онлайн — создать бесплатно за минуту | invoices.kz',
  description:
    'Создайте счёт на оплату для ИП или ТОО Казахстана онлайн: реквизиты, БИН, банк и БИК из справочника, НДС 16% или без НДС, сумма прописью. Готовый PDF за минуту, без регистрации — 3 счёта в день бесплатно.',
  keywords:
    'счет на оплату образец казахстан, счет на оплату скачать, выставить счет онлайн бесплатно, счет на оплату ип образец, счет на оплату тоо, создать счет на оплату, счет с ндс 16 казахстан',
  alternates: { canonical: 'https://invoices.kz/tools/schet' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/tools/schet',
    siteName: 'INVOICES.KZ',
    title: 'Счёт на оплату онлайн — бесплатно за минуту',
    description: 'Реквизиты, БИН, банк из справочника, НДС 16% или без, сумма прописью. PDF без регистрации.',
    images: [{ url: 'https://invoices.kz/og/tool-schet.png', width: 1200, height: 630, alt: 'Счёт на оплату онлайн — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Счёт на оплату онлайн — бесплатно за минуту',
    description: 'Реквизиты, БИН, банк из справочника, НДС 16% или без, сумма прописью. PDF без регистрации.',
    images: ['https://invoices.kz/og/tool-schet.png'],
  },
}

export default function SchetToolLayout({ children }: { children: React.ReactNode }) {
  return children
}
