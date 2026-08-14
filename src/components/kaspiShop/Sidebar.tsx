'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ORDER_STATUS_TABS } from '@/lib/kaspiShop/orderStatuses'

// Shared across every Kaspi Shop sub-page -- same floating-card language as
// the rest of invoices.kz (AppNav), scoped to Kaspi Shop's own sections so
// this reads as a real sub-cabinet, not one lonely page. When active is
// "orders", nests the real status list under "Заказы" (desktop only --
// same pattern as the real Kaspi cabinet's own left-hand nav), matching
// orderStatus/orderCounts passed down from the orders page.
export default function KaspiShopSidebar({ active, orderStatus, orderCounts }: {
  active: 'demping' | 'orders' | 'finance' | 'pending-products' | 'niches'
  orderStatus?: string
  orderCounts?: Record<string, number>
}) {
  const router = useRouter()

  return (
    <aside className="lg:w-[220px] lg:flex-shrink-0 lg:p-4">
      <div className="lg:sticky lg:top-4 bg-white lg:rounded-[28px] lg:shadow-2xl lg:ring-1 lg:ring-black/5 px-4 py-4 lg:py-6">
        <div className="flex items-center gap-2 mb-1 lg:mb-6">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-xl leading-none" aria-label="Назад">‹</button>
          <div>
            <div className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase">Kaspi</div>
            <div className="text-sm font-extrabold text-[#1C2056] -mt-0.5">Магазин</div>
          </div>
        </div>
        <nav className="hidden lg:flex flex-col gap-1">
          <Link href="/kaspi-shop"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'demping' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Демпинг
          </Link>
          <Link href="/kaspi-shop/orders"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'orders' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Заказы
          </Link>
          {active === 'orders' && (
            <div className="ml-2 pl-3 border-l border-gray-100 flex flex-col gap-0.5 mb-1">
              {ORDER_STATUS_TABS.map(tab => {
                const count = orderCounts?.[tab.value]
                const isActive = orderStatus === tab.value
                return (
                  <Link key={tab.value} href={`/kaspi-shop/orders?status=${tab.value}`}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${isActive ? 'bg-[#1C2056]/5 text-[#1C2056] font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}>
                    <span>{tab.label}</span>
                    {!!count && <span className="text-[10px] text-gray-400 tabular-nums">{count}</span>}
                  </Link>
                )
              })}
            </div>
          )}
          <Link href="/kaspi-shop/finance"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'finance' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Финансы
          </Link>
          <Link href="/kaspi-shop/pending-products"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'pending-products' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Нераспознанные товары
          </Link>
          <Link href="/kaspi-shop/niches"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'niches' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Ниши
          </Link>
        </nav>
      </div>
    </aside>
  )
}
