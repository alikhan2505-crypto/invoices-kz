import Link from 'next/link'

// Wildberries isn't finished (founder, 21.09.2026), so every page under
// /wildberries is held back for everyone, admin included -- the nav shows the
// section with a lock (SiteNav.tsx, `soon`). The pages themselves are left
// untouched below this layout: to reopen the section, delete this file and
// drop `soon` from SiteNav's SECTIONS entry. The /api/wildberries routes are
// not affected, they only run for a connection someone already made.
export default function WildberriesLayout() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="text-lg font-semibold text-[#1C2056]">Wildberries — скоро</h1>
        <p className="text-sm text-gray-500">
          Раздел ещё дорабатывается. Откроем его для всех, когда он будет готов.
        </p>
        <Link href="/dashboard" className="inline-block text-sm text-[#1C2056] font-medium underline">
          Вернуться на дашборд
        </Link>
      </div>
    </main>
  )
}
