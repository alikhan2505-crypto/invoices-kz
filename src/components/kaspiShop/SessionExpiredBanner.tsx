'use client'
import Link from 'next/link'

// Shown at the top of any Kaspi Shop sub-page whose data comes from a live
// call to the seller's real Kaspi cabinet, once that route's own response
// reports sessionExpired:true (see cabinetApi.ts/pendingProducts.ts --
// specifically a 401 from Kaspi, written to kaspi_shop_connections via
// connection.ts's markSessionExpired). The actual phone+SMS reconnect form
// lives only on the Демпинг page (/kaspi-shop), so every other page just
// links there rather than duplicating that flow.
export default function SessionExpiredBanner() {
  return (
    <div className="bg-[#FFF4E5] rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
      <span className="text-sm text-[#B15E00]">Сессия кабинета Kaspi истекла — переподключитесь, чтобы данные снова обновлялись.</span>
      <Link href="/kaspi-shop" className="text-xs bg-[#B15E00] text-white rounded-lg px-3 py-1.5 flex-shrink-0 whitespace-nowrap">Переподключиться</Link>
    </div>
  )
}
