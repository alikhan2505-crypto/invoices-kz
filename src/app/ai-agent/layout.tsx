import type { Metadata } from 'next'
import ProductShell from '@/components/ProductShell'
import { noindexMetadata } from '@/lib/noindex'

export const metadata: Metadata = noindexMetadata()

export default function AiAgentLayout({ children }: { children: React.ReactNode }) {
  return <ProductShell product="aiAgent">{children}</ProductShell>
}
