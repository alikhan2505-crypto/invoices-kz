import type { Metadata } from 'next'
import { noindexMetadata } from '@/lib/noindex'

export const metadata: Metadata = noindexMetadata('Договор — INVOICES.KZ')

export default function ContractViewLayout({ children }: { children: React.ReactNode }) {
  return children
}
