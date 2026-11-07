import type { Metadata } from 'next'
import { Unbounded, Onest, Caveat } from 'next/font/google'
import HomePreview from '@/components/homePreview/HomePreview'

// Шрифты маркетинговых страниц (DESIGN.md §7), как у хаба: Unbounded для
// крупных заголовков, Onest для текста, Caveat для одной рукописной пометки.
const unbounded = Unbounded({ subsets: ['cyrillic', 'latin'], weight: ['700'], variable: '--font-unbounded', display: 'swap' })
const onest = Onest({ subsets: ['cyrillic', 'cyrillic-ext', 'latin'], variable: '--font-onest', display: 'swap' })
const caveat = Caveat({ subsets: ['cyrillic', 'cyrillic-ext', 'latin'], weight: ['600'], variable: '--font-caveat', display: 'swap' })

// ПРЕВЬЮ новой главной (по просьбе основателя: сначала посмотреть). Не для
// поисковиков: noindex+nofollow, в sitemap.ts и llms.txt адреса нет, ссылок
// на него нигде нет. Корень layout даёт robots 'index, follow' и canonical на
// главную, поэтому оба переопределены здесь. Страница НЕ входит в публичные
// пути PostHog (src/lib/analytics/posthogConfig.ts), записи сессий на ней нет.
export const metadata: Metadata = {
  title: 'invoices.kz: превью новой главной',
  description: 'Черновик новой главной страницы invoices.kz.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  alternates: { canonical: null },
  openGraph: { title: 'invoices.kz: превью новой главной', description: 'Черновик новой главной страницы invoices.kz.', url: undefined, images: [] },
  twitter: { title: 'invoices.kz: превью новой главной', description: 'Черновик новой главной страницы invoices.kz.', images: [] },
}

// Метка для CSS: сцена с прокруткой включается только если JS работает.
// Скрипт стоит в серверной разметке и срабатывает до первой отрисовки
// (как LANG_BOOT_SCRIPT в layout), поэтому кадра «столбиком» перед сценой
// нет; без JS остаётся статичная вёрстка столбиком.
const JS_FLAG = "document.documentElement.classList.add('hp-js')"

export default function HomePreviewPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      <HomePreview fontClass={`${unbounded.variable} ${onest.variable} ${caveat.variable}`} />
    </>
  )
}
