import type { Metadata } from 'next'

// Метаданные в layout — страница клиентская (как у остальных /tools).
// Инструмент под запрос «налоги ип калькулятор» — с цифрами нового
// Налогового кодекса 2026, которых у большинства старых калькуляторов нет.
export const metadata: Metadata = {
  title: 'Калькулятор налогов ИП 2026 — упрощёнка 4% и взносы за себя | invoices.kz',
  description:
    'Сколько платит ИП на упрощёнке в 2026 году по новому Налоговому кодексу: налог 4% с дохода, ОПВ, ОПВР, СО и ВОСМС за себя. Посчитайте свою сумму в месяц и за полугодие — бесплатно, без регистрации.',
  keywords:
    'налоги ип калькулятор казахстан, упрощенка 4 процента 2026, сколько платит ип казахстан, взносы ип за себя 2026, опв со восмс ип, налоговый кодекс 2026 ип, форма 910 сколько платить',
  alternates: { canonical: 'https://invoices.kz/tools/nalogi' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/tools/nalogi',
    siteName: 'INVOICES.KZ',
    title: 'Калькулятор налогов ИП 2026 — упрощёнка 4% и взносы',
    description: 'Налог 4% и взносы за себя по новому Налоговому кодексу 2026. Бесплатно, без регистрации.',
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: 'Калькулятор налогов ИП — invoices.kz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Калькулятор налогов ИП 2026 — упрощёнка 4% и взносы',
    description: 'Налог 4% и взносы за себя по новому Налоговому кодексу 2026.',
    images: ['https://invoices.kz/og-image.png'],
  },
}

export default function NalogiToolLayout({ children }: { children: React.ReactNode }) {
  return children
}
