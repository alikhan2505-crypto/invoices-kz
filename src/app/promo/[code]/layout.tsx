import { noindexMetadata } from '@/lib/noindex'

// /promo/<код> -- одноразовая ссылка-переадресация на /login?promo=...: код в
// адресе, содержимого для поиска нет. noindex тегом (не Disallow: краулер должен
// увидеть тег). Страница -- 'use client', поэтому метаданные здесь.
export const metadata = noindexMetadata('Промокод — INVOICES.KZ')

export default function PromoLayout({ children }: { children: React.ReactNode }) {
  return children
}
