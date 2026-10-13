import type { Metadata } from 'next'

// Метаданные в layout — страница клиентская (как у остальных /tools).
export const metadata: Metadata = {
  title: 'Коммерческое предложение онлайн — КП бесплатно за минуту | invoices.kz',
  description:
    'Создайте коммерческое предложение для клиента онлайн: позиции с ценами, срок действия, НДС, реквизиты. Готовый PDF за минуту, без регистрации — 3 КП в день бесплатно.',
  keywords:
    'коммерческое предложение образец казахстан, кп скачать бесплатно, коммерческое предложение ип, как составить кп, коммерческое предложение на услуги образец',
  alternates: { canonical: 'https://invoices.kz/tools/kp' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/tools/kp',
    siteName: 'INVOICES.KZ',
    title: 'Коммерческое предложение онлайн — за минуту',
    description: 'Позиции с ценами, срок действия, НДС, реквизиты. PDF без регистрации.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'КП онлайн — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Коммерческое предложение онлайн — за минуту',
    description: 'Позиции с ценами, срок действия, НДС, реквизиты. PDF без регистрации.',
    images: ['https://invoices.kz/og-image.png'],
  },
}

export default function KpToolLayout({ children }: { children: React.ReactNode }) {
  return children
}
