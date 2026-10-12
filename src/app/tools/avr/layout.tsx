import type { Metadata } from 'next'

// Метаданные в layout — страница клиентская (как у остальных /tools).
// АВР — второй по частоте документ после счёта на оплату.
export const metadata: Metadata = {
  title: 'АВР онлайн — акт выполненных работ бесплатно за минуту | invoices.kz',
  description:
    'Создайте акт выполненных работ (оказанных услуг) для ИП или ТОО Казахстана онлайн: реквизиты сторон, договор, НДС, сумма прописью. Готовый PDF за минуту, без регистрации — 3 акта в день бесплатно.',
  keywords:
    'авр образец казахстан, акт выполненных работ скачать, акт оказанных услуг ип, авр онлайн бесплатно, акт выполненных работ тоо, р-1 акт казахстан',
  alternates: { canonical: 'https://invoices.kz/tools/avr' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/tools/avr',
    siteName: 'INVOICES.KZ',
    title: 'АВР онлайн — акт выполненных работ за минуту',
    description: 'Реквизиты сторон, договор, НДС, сумма прописью. PDF без регистрации.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'АВР онлайн — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'АВР онлайн — акт выполненных работ за минуту',
    description: 'Реквизиты сторон, договор, НДС, сумма прописью. PDF без регистрации.',
    images: ['https://invoices.kz/og-image.png'],
  },
}

export default function AvrToolLayout({ children }: { children: React.ReactNode }) {
  return children
}
