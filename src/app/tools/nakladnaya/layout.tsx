import type { Metadata } from 'next'

// Метаданные в layout — страница клиентская (как у остальных /tools).
export const metadata: Metadata = {
  title: 'Накладная онлайн — накладная на отпуск запасов бесплатно | invoices.kz',
  description:
    'Создайте накладную на отпуск запасов на сторону (З-2) для ИП или ТОО Казахстана онлайн: стороны, товары, сумма прописью. Готовый PDF за минуту, без регистрации — 3 накладные в день бесплатно.',
  keywords:
    'накладная на отпуск запасов образец, накладная з-2 казахстан, накладная скачать бесплатно, расходная накладная ип, накладная на товар казахстан',
  alternates: { canonical: 'https://invoices.kz/tools/nakladnaya' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/tools/nakladnaya',
    siteName: 'INVOICES.KZ',
    title: 'Накладная онлайн — за минуту, бесплатно',
    description: 'Накладная на отпуск запасов (З-2): стороны, товары, сумма прописью. PDF без регистрации.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'Накладная онлайн — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Накладная онлайн — за минуту, бесплатно',
    description: 'Накладная на отпуск запасов (З-2): стороны, товары, сумма прописью.',
    images: ['https://invoices.kz/og-image.png'],
  },
}

export default function NakladnayaToolLayout({ children }: { children: React.ReactNode }) {
  return children
}
