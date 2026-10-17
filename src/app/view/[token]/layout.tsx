import type { Metadata } from 'next'
import { noindexMetadata } from '@/lib/noindex'

// Публичная страница счёта по токену: не для поисковиков (на ней БИН, ИИК и
// суммы). Номер счёта во вкладку дописывает страница, когда загрузит данные;
// здесь только общее название, без обращения к базе.
export const metadata: Metadata = noindexMetadata('Счёт — INVOICES.KZ')

export default function ViewLayout({ children }: { children: React.ReactNode }) {
  return children
}
