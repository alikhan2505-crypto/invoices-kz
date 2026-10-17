import type { Metadata } from 'next'
import ProductShell from '@/components/ProductShell'
import { noindexMetadata } from '@/lib/noindex'

// Это кабинет (токен, баланс, выписка), а не лендинг: публичная страница API
// живёт в /cashier-api (корень api.invoices.kz) и индексируется как прежде.
export const metadata: Metadata = noindexMetadata()

export default function KaspiApiLayout({ children }: { children: React.ReactNode }) {
  return <ProductShell product="kaspiApi">{children}</ProductShell>
}
