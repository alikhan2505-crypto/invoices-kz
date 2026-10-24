import Link from 'next/link'
import { noindexMetadata } from '@/lib/noindex'

// Раздел закрыт заглушкой, содержимого для поиска нет -- noindex на весь сегмент.
export const metadata = noindexMetadata('Wildberries — скоро')

// Wildberries isn't finished (founder, 21.09.2026), so every page under
// /wildberries is held back for everyone, admin included -- the nav shows the
// section with a lock (SiteNav.tsx, `soon`). The pages themselves are left
// untouched below this layout: to reopen the section, delete this file and
// drop `soon` from SiteNav's SECTIONS entry. The /api/wildberries routes are
// not affected, they only run for a connection someone already made.
export default function WildberriesLayout() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-sm text-center space-y-3">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Wildberries — скоро</h1>
        <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
          Раздел ещё дорабатывается. Откроем его для всех, когда он будет готов.
        </p>
        <Link href="/dashboard" className="inline-block text-sm font-medium underline"
          style={{ color: 'var(--nav-accent)' }}>
          Вернуться на дашборд
        </Link>
      </div>
    </main>
  )
}
