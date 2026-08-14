'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'

const EASE = [0.16, 1, 0.3, 1] as const

type PendingProduct = {
  code: string
  name: string
  brand: string | null
  categoryName: string | null
  imageUrl: string | null
}

const TABS = [
  { key: 'CHECK', label: 'Без привязки', enabled: true },
  { key: 'PENDING', label: 'Требуют доработок', enabled: false },
  { key: 'IMPORTED', label: 'На проверке', enabled: false },
  { key: 'TRASH', label: 'Отклонены', enabled: false },
]

export default function KaspiShopPendingProducts() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [products, setProducts] = useState<PendingProduct[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [count, setCount] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading) loadProducts(page) }, [page, loading])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }
    setLoading(false)
  }

  async function loadProducts(forPage: number) {
    setListLoading(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/pending-products?page=${forPage}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить товары'); setProducts([]); setHasMore(false); return }
      setProducts(data.products || [])
      setHasMore(!!data.hasMore)
      setCount(data.count || 0)
      if (data.sessionExpired) setSessionExpired(true)
    } catch {
      setLoadError('Не удалось загрузить товары. Проверьте соединение и попробуйте ещё раз.')
      setProducts([])
      setHasMore(false)
    } finally {
      setListLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-[#F6F6FB] lg:flex">
      <KaspiShopSidebar active="pending-products" />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {sessionExpired && <SessionExpiredBanner />}

        {loadError && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={() => loadProducts(page)} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="bg-[#12142E] rounded-[28px] p-6 lg:p-8 mb-4 text-white">
          <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-1">Товары</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-6">
            Нераспознанные товары {count > 0 && <span className="text-white/40">· {count}</span>}
          </h1>
          <div className="flex items-center gap-1 flex-wrap bg-white/10 rounded-full p-1 w-fit">
            {TABS.map(tab => (
              <button key={tab.key} disabled={!tab.enabled}
                className={`text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${
                  tab.enabled ? 'bg-white text-[#12142E]' : 'text-white/30 cursor-not-allowed'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </motion.div>

        {listLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">Загружаем товары...</div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="text-sm text-gray-500">Нераспознанных товаров нет.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.code} className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gray-100 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 truncate">{p.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {p.brand && <span>{p.brand}</span>}
                    {p.categoryName && <span>{p.brand ? ' · ' : ''}Kaspi предлагает: {p.categoryName}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-end mt-4">
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="text-xs font-medium bg-white text-[#1C2056] rounded-lg px-3 py-1.5 disabled:opacity-40 shadow-sm">Назад</button>
              <button onClick={() => setPage(p => p + 1)} disabled={!hasMore}
                className="text-xs font-medium bg-white text-[#1C2056] rounded-lg px-3 py-1.5 disabled:opacity-40 shadow-sm">Дальше</button>
            </div>
          </div>
        )}
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 flex items-center justify-between z-40">
        <div className="text-xs font-semibold text-[#1C2056]">Нераспознанные товары</div>
      </div>
    </main>
  )
}
