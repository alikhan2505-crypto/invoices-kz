'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const SOON_ITEMS = ['Финансы', 'Каталог НКТ', 'Ниши', 'Предзаказ']

// Shared across every Kaspi Shop sub-page -- same floating-card language as
// the rest of invoices.kz (AppNav), scoped to Kaspi Shop's own sections so
// this reads as a real sub-cabinet, not one lonely page.
export default function KaspiShopSidebar({ active }: { active: 'demping' | 'orders' }) {
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
          {SOON_ITEMS.map(item => (
            <div key={item} className="flex items-center justify-between rounded-xl text-sm text-gray-300 px-3 py-2.5 select-none">
              <span>{item}</span>
              <span className="text-[9px] font-semibold tracking-wide bg-gray-100 text-gray-400 rounded-full px-1.5 py-0.5">СКОРО</span>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  )
}
