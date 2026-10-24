import type { Metadata } from 'next'

// Закрытые от поисковиков страницы (17.10.2026): адреса с токеном счёта или
// договора (на странице БИН, ИИК, банк и суммы), кабинетные оболочки и
// страницы подписи. Корневой layout отдаёт всем 'index, follow', поэтому у этих
// сегментов своё значение перекрывает его. Страницы с токеном (/view,
// /contract-view) НЕ закрыты в robots.txt намеренно: при Disallow поисковик не
// заходит на страницу, не видит тег noindex и может держать уже найденный адрес
// в выдаче голым URL. Кабинетные оболочки закрыты и тегом, и Disallow (они за
// входом, содержимого для индекса там нет).
export const NOINDEX_ROBOTS: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  nocache: true,
}

export function noindexMetadata(title?: string): Metadata {
  return title ? { title, robots: NOINDEX_ROBOTS } : { robots: NOINDEX_ROBOTS }
}

// Префиксы, которые обязаны быть закрыты в public/robots.txt. Тест
// (noindex.test.ts) сверяет файл с этим списком и проверяет, что публичные
// страницы туда не попали.
export const ROBOTS_DISALLOW_PREFIXES = [
  '/dashboard', '/history', '/profile', '/invoice', '/admin', '/onboarding',
  '/create', '/upgrade',
  '/kaspi-shop', '/ai-agent', '/cfo',
] as const

// Эти адреса индексируются: лендинги, инструменты, гайды, витрины салонов.
export const ROBOTS_MUST_STAY_ALLOWED = [
  '/view/some-token', '/contract-view/some-token',
  '/', '/tools', '/tools/waybills', '/guides', '/guides/x', '/lp/kaspi', '/lp/agent',
  '/bik', '/bik/kaspi-bank', '/cashier-api', '/kaspi-api', '/s/salon', '/shop/x', '/login', '/products', '/privacy', '/terms',
] as const
