import type { Metadata } from 'next'
import ProductShell from '@/components/ProductShell'
import KaspiShopGate from './KaspiShopGate'
import { noindexMetadata } from '@/lib/noindex'

export const metadata: Metadata = noindexMetadata()

export default function KaspiShopLayout({ children }: { children: React.ReactNode }) {
  return <ProductShell product="kaspiShop"><KaspiShopGate>{children}</KaspiShopGate></ProductShell>
}
