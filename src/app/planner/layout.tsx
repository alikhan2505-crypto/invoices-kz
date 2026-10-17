import type { Metadata } from 'next'
import { noindexMetadata } from '@/lib/noindex'

export const metadata: Metadata = noindexMetadata()

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return children
}
