import type { Metadata } from 'next'
import { noindexMetadata } from '@/lib/noindex'

// Страница клиентская ('use client'), metadata ей экспортировать нельзя, поэтому свой
// заголовок вкладки задаёт этот layout: раньше у неё был общий title (аудит 02.11.2026).
export const metadata: Metadata = noindexMetadata('Генератор сайтов салонов — INVOICES.KZ')

export default function SiteGeneratorLayout({ children }: { children: React.ReactNode }) {
  return children
}
