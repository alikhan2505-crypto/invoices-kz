import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Бесплатные инструменты для продавцов Kaspi — invoices.kz',
  description:
    'Калькулятор маржи Kaspi Магазина с комиссиями по категориям и склейка накладных в один PDF. Бесплатно, без регистрации.',
  keywords:
    'калькулятор маржи kaspi, комиссия kaspi магазина, накладные kaspi печать, склейка накладных kaspi pdf',
  alternates: { canonical: 'https://invoices.kz/tools' },
  openGraph: {
    type: 'website',
    locale: 'ru_KZ',
    url: 'https://invoices.kz/tools',
    siteName: 'INVOICES.KZ',
    title: 'Бесплатные инструменты для продавцов Kaspi — invoices.kz',
    description: 'Калькулятор маржи Kaspi и склейка накладных в один PDF. Бесплатно, без регистрации.',
    images: [{ url: 'https://invoices.kz/og/tools-index.png', width: 1200, height: 630, alt: 'Инструменты — invoices.kz' }],
  },
}

const TOOLS = [
  {
    href: '/tools/schet',
    title: 'Счёт на оплату онлайн',
    text: 'Готовый счёт по казахстанской форме за минуту: БИК из справочника, сумма прописью, НДС 16% или без. 3 счёта в день бесплатно.',
  },
  {
    href: '/tools/avr',
    title: 'Акт выполненных работ онлайн',
    text: 'Готовый АВР по привычной форме: стороны, договор, сумма прописью, НДС. 3 акта в день бесплатно.',
  },
  {
    href: '/tools/nakladnaya',
    title: 'Накладная онлайн',
    text: 'Накладная на отпуск запасов (З-2): стороны, товары, сумма прописью. 3 накладные в день бесплатно.',
  },
  {
    href: '/tools/kp',
    title: 'Коммерческое предложение',
    text: 'Аккуратное КП с позициями, итогом и сроком действия — отправьте клиенту за минуту. 3 КП в день бесплатно.',
  },
  {
    href: '/tools/nalogi',
    title: 'Налоги ИП — 2026',
    text: 'Сколько платит ИП на упрощёнке по новому кодексу: налог 4% и взносы за себя — помесячно и за полугодие.',
  },
  {
    href: '/tools/kontragent',
    title: 'Проверка контрагента по БИН',
    text: 'Неблагонадёжность, ликвидация, налоговая задолженность и НДС — по официальным данным КГД. 3 проверки в день бесплатно.',
  },
  {
    href: '/tools/margin',
    title: 'Калькулятор маржи Kaspi',
    text: 'Сколько остаётся с продажи после комиссии категории, доставки и налога — и сколько это в месяц.',
  },
  {
    href: '/tools/waybills',
    title: 'Склейка накладных Kaspi',
    text: 'Накладные одним PDF: 4 на лист А4 или А6 на термопринтер — без ножниц и возни.',
  },
]

// Страница-указатель: на сами инструменты ссылаются напрямую, но адрес
// /tools набирают и руками — раньше здесь был 404.
export default function ToolsIndex() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
          <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
            invoices.kz
          </Link>
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
          Бесплатные инструменты
        </h1>
        <p className="text-sm mb-7" style={{ color: 'var(--nav-text-secondary)' }}>
          Считают и печатают без регистрации. Для продавцов Kaspi и не только.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map(t => (
            <Link key={t.href} href={t.href} className="nav-glass rounded-2xl p-5 block" style={{ color: 'var(--nav-text-primary)' }}>
              <div className="text-base font-semibold mb-1.5">{t.title}</div>
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{t.text}</div>
            </Link>
          ))}
        </div>

        <div className="mt-8">
          <Link href="/guides" className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
            Гайды по документам и комиссиям →
          </Link>
        </div>
      </div>
    </div>
  )
}
