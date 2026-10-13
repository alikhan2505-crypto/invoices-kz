import type { Metadata } from 'next'

// Same reason /tools/margin has its own layout: the page itself is a client
// component and can't export metadata. Эта страница существует, чтобы её
// находили по «проверить контрагента по БИН» — ей нужны свои слова.
export const metadata: Metadata = {
  title: 'Проверка контрагента по БИН — бесплатно, по данным КГД | invoices.kz',
  description:
    'Проверьте контрагента по БИН за секунды: неблагонадёжность, ликвидация, налоговая задолженность и статус плательщика НДС — по официальным реестрам ГБД ЮЛ и КГД РК. Бесплатно, без регистрации.',
  keywords:
    'проверка контрагента по бин, проверить бин казахстан, неблагонадёжный налогоплательщик кгд, проверить тоо по бин, налоговая задолженность по бин, плательщик ндс проверить бин, ликвидация тоо проверка',
  alternates: { canonical: 'https://invoices.kz/tools/kontragent' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/tools/kontragent',
    siteName: 'INVOICES.KZ',
    title: 'Проверка контрагента по БИН — бесплатно',
    description:
      'Неблагонадёжность, ликвидация, налоговая задолженность и НДС — по официальным реестрам КГД РК. Без регистрации.',
    images: [{ url: 'https://invoices.kz/og/tool-kontragent.png', width: 1200, height: 630, alt: 'Проверка контрагента — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Проверка контрагента по БИН — бесплатно',
    description: 'Неблагонадёжность, ликвидация, налоговая задолженность и НДС по официальным реестрам КГД РК.',
    images: ['https://invoices.kz/og/tool-kontragent.png'],
  },
}

export default function KontragentToolLayout({ children }: { children: React.ReactNode }) {
  return children
}
