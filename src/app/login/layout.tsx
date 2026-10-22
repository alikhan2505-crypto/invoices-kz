import type { Metadata } from 'next'
import { noindexMetadata } from '@/lib/noindex'

// Форма входа -- не страница для поисковика: noindex (robots.txt её НЕ закрывает
// намеренно, иначе краулер не увидит тег) и в sitemap её нет. Метаданные живут
// в layout, потому что сама страница -- 'use client' и export metadata не умеет.
export const metadata: Metadata = {
  ...noindexMetadata('Вход — INVOICES.KZ'),
  alternates: { canonical: 'https://invoices.kz/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
