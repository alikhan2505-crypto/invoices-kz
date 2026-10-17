import type { Metadata } from 'next'
import { noindexMetadata } from '@/lib/noindex'

export const metadata: Metadata = noindexMetadata('Проверка подписи — INVOICES.KZ')

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children
}
