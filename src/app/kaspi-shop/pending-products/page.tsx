'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'
import { getActivePlan } from '@/lib/plan'

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
    const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
    if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/dashboard'); return }
    // Демпинг is the only page with the actual connect terminal (phone/OTP)
    // -- every other page redirects there instead of rendering its own broken
    // state when there's no active connection (2026-09-03 founder: check for a
    // connected store before opening any page or sub-page).
    const { data: { session } } = await supabase.auth.getSession()
    const connRes = await fetch('/api/kaspi-shop/wallet', { headers: { Authorization: `Bearer ${session?.access_token}` } })
    const connData = await connRes.json().catch(() => null)
    if (!connData?.connected) { router.push('/kaspi-shop'); return }
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
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {sessionExpired && <SessionExpiredBanner />}

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => loadProducts(page)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Товары</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-6" style={{ color: 'var(--nav-text-primary)' }}>
            Нераспознанные товары {count > 0 && <span style={{ color: 'var(--nav-text-muted)' }}>· {count}</span>}
          </h1>
          <div className="flex items-center gap-1 flex-wrap nav-glass rounded-full p-1 w-fit">
            {TABS.map(tab => (
              <button key={tab.key} disabled={!tab.enabled}
                className="text-xs font-medium rounded-full px-3 py-1.5 transition-colors"
                style={tab.enabled
                  ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                  : { color: 'var(--nav-text-muted)', opacity: 0.6, cursor: 'not-allowed' }}>
                {tab.label}
              </button>
            ))}
          </div>
        </motion.div>

        {listLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем товары...</div>
        ) : products.length === 0 ? (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Нераспознанных товаров нет.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.code} className="nav-glass rounded-2xl p-3 flex items-center gap-3">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                ) : (
                  <div className="w-14 h-14 rounded-xl flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{p.name}</div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--nav-text-muted)' }}>
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
                className="nav-glass text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-40" style={{ color: 'var(--nav-text-primary)' }}>Назад</button>
              <button onClick={() => setPage(p => p + 1)} disabled={!hasMore}
                className="nav-glass text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-40" style={{ color: 'var(--nav-text-primary)' }}>Дальше</button>
            </div>
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
