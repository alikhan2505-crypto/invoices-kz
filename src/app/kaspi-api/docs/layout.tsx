import type { Metadata } from 'next'

// This page used to be fully public (no auth check at all) and may already
// be indexed by search engines. Now that it requires a login (Task 4's
// rewrite), it must stop being indexed going forward -- a search visitor
// landing on a login redirect is a bad experience, and there is no reason
// for this URL to appear in search results at all.
export const metadata: Metadata = {
  title: 'Kaspi Cashier API — документация',
  robots: { index: false, follow: false },
}

export default function KaspiApiDocsLayout({ children }: { children: React.ReactNode }) {
  return children
}
