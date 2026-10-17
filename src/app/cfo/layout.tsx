import type { Metadata } from 'next'
import ProductShell from '@/components/ProductShell'
import CfoWorkspace from './CfoWorkspace'
import { noindexMetadata } from '@/lib/noindex'

export const metadata: Metadata = noindexMetadata()

export default function CfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProductShell product="cfo">
      <CfoWorkspace>{children}</CfoWorkspace>
    </ProductShell>
  )
}
