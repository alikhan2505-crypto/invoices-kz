'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'
import { ORDER_STATUS_TABS, TRANSFER_STATUS } from '@/lib/kaspiShop/orderStatuses'

const EASE = [0.16, 1, 0.3, 1] as const
const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
  items: { code: string; name: string; imageUrl: string | null; quantity: number }[]
}

function KaspiShopOrdersInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get('status') || ORDER_STATUS_TABS[0].value

  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [groupBy, setGroupBy] = useState<'type' | 'date' | null>(null)

  const PAGE_SIZE = 10
  const prevStatus = useRef(status)

  useEffect(() => { checkAccess() }, [])
  useEffect(() => {
    if (loading) return
    // A status switch resets to page 0 -- skip this render's fetch (it'd
    // use the stale page from the previous status) and let the resulting
    // setPage(0) re-trigger this effect with the right value instead.
    if (prevStatus.current !== status) {
      prevStatus.current = status
      setPage(0)
      if (page === 0) { loadOrders(status, 0); loadCounts() }
      return
    }
    loadOrders(status, page)
    loadCounts()
  }, [status, page, loading])

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

  async function loadOrders(forStatus: string, forPage: number) {
    setOrdersLoading(true)
    setLoadError('')
    setSelected(new Set())
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/orders?status=${encodeURIComponent(forStatus)}&page=${forPage}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить заказы'); setOrders([]); setTotal(0); return }
      setOrders(data.orders || [])
      setTotal(data.total || 0)
      if (data.sessionExpired) setSessionExpired(true)
    } catch (e: any) {
      setLoadError('Не удалось загрузить заказы. Проверьте соединение и попробуйте ещё раз.')
      setOrders([])
      setTotal(0)
    } finally {
      setOrdersLoading(false)
    }
  }

  async function loadCounts() {
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/orders/counters', { headers })
      if (!res.ok) return
      const data = await res.json()
      setCounts(data.counts || {})
      if (data.sessionExpired) setSessionExpired(true)
    } catch {
      // Badge counts are a nice-to-have -- a failure here shouldn't block
      // the order list itself from showing.
    }
  }

  function toggleSelected(code: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }

  async function printWaybills() {
    if (selected.size === 0) return
    setPrinting(true)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/orders/waybills', {
        method: 'POST', headers, body: JSON.stringify({ orderCodes: Array.from(selected) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось получить накладные')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nakladnye.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setPrinting(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {sessionExpired && <SessionExpiredBanner />}

        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--nav-text-primary)' }}>Заказы</h1>
          <div className="relative flex items-center gap-0.5 nav-glass rounded-full p-[3px]">
            {([['type', 'По виду'], ['date', 'По дате']] as const).map(([value, label]) => {
              const active = groupBy === value
              return (
                <button key={value} onClick={() => setGroupBy(g => g === value ? null : value)}
                  className="relative px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                  {active && (
                    <motion.span layoutId="groupByPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)', zIndex: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                  )}
                  <span className="relative" style={{ zIndex: 1 }}>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => loadOrders(status, page)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {/* Order-status filter chips -- used to be a desktop-only nested
            subnav inside KaspiShopSidebar, which left mobile with no way to
            filter by status at all. Now page-local and works at every
            width; the sidebar's own duplicate submenu goes away once that
            component is replaced by SiteNav in a later pass. */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {ORDER_STATUS_TABS.map(tab => {
            const active = status === tab.value
            return (
              <button key={tab.value} onClick={() => router.push(`/kaspi-shop/orders?status=${tab.value}`)}
                className="relative overflow-hidden flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors"
                style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)', background: active ? 'transparent' : 'var(--nav-surface-glass)' }}>
                {active && (
                  <motion.span layoutId="orderStatusPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{tab.label}{!!counts[tab.value] && ` ${counts[tab.value]}`}</span>
              </button>
            )
          })}
        </div>

        {status === TRANSFER_STATUS && selected.size > 0 && (
          <div className="rounded-2xl p-3 flex items-center justify-between gap-3 mb-4" style={{ background: 'var(--nav-accent)' }}>
            <span className="text-sm" style={{ color: 'var(--nav-accent-ink)' }}>Выбрано заказов: {selected.size}</span>
            <button onClick={printWaybills} disabled={printing}
              className="text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
              {printing ? 'Готовим PDF...' : 'Распечатать все накладные'}
            </button>
          </div>
        )}

        {ordersLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем заказы...</div>
        ) : orders.length === 0 ? (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Заказов в этом статусе нет.</div>
          </div>
        ) : (() => {
          const CARD_GRID = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5'

          function renderCard(o: Order, i: number) {
            const firstItem = o.items[0]
            const extraCount = o.items.length - 1
            const selectable = status === TRANSFER_STATUS
            return (
              <motion.div key={o.code} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE, delay: Math.min(i * 0.02, 0.2) }}
                onClick={() => selectable && toggleSelected(o.code)}
                className={`relative nav-glass rounded-xl overflow-hidden ${selectable ? `cursor-pointer ${CARD_HOVER}` : ''}`}
                style={selectable && selected.has(o.code) ? { boxShadow: '0 0 0 2px var(--nav-success)' } : undefined}>
                {selectable && (
                  <input type="checkbox" checked={selected.has(o.code)} onClick={e => e.stopPropagation()}
                    onChange={() => toggleSelected(o.code)}
                    className="absolute top-1.5 left-1.5 z-10 accent-[var(--nav-success)] w-3.5 h-3.5" />
                )}
                {firstItem?.imageUrl ? (
                  <img src={firstItem.imageUrl} alt={firstItem.name} className="w-full aspect-square object-cover" style={{ background: 'var(--nav-bg)' }} />
                ) : (
                  <div className="w-full aspect-square" style={{ background: 'var(--nav-bg)' }} />
                )}
                <div className="p-2">
                  <div className="text-[11px] font-semibold line-clamp-2 min-h-[2em]" style={{ color: 'var(--nav-text-primary)' }}>
                    {firstItem?.name || `Заказ №${o.code}`}
                    {extraCount > 0 && <span style={{ color: 'var(--nav-text-muted)', fontWeight: 400 }}> +{extraCount}</span>}
                  </div>
                  <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--nav-text-muted)' }}>{o.customerFirstName} {o.customerLastName}</div>
                  <div className="font-mono font-bold text-xs tabular-nums mt-1" style={{ color: 'var(--nav-text-primary)' }}>{o.totalPrice.toLocaleString('ru-KZ')} ₸</div>
                </div>
              </motion.div>
            )
          }

          if (!groupBy) {
            return <div className={CARD_GRID}>{orders.map((o, i) => renderCard(o, i))}</div>
          }

          const groups = new Map<string, Order[]>()
          for (const o of orders) {
            const key = groupBy === 'type'
              ? (o.items[0]?.name || 'Без названия')
              : new Date(o.creationTime).toLocaleDateString('ru-KZ')
            const list = groups.get(key) || []
            list.push(o)
            groups.set(key, list)
          }
          const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
            groupBy === 'date' ? b[1][0].creationTime.localeCompare(a[1][0].creationTime) : b[1].length - a[1].length
          )

          return (
            <div className="space-y-5">
              {sortedGroups.map(([key, groupOrders]) => (
                <div key={key}>
                  <div className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--nav-text-secondary)' }}>
                    {key} <span style={{ color: 'var(--nav-text-muted)', fontWeight: 400 }}>· {groupOrders.length}</span>
                  </div>
                  <div className={CARD_GRID}>{groupOrders.map((o, i) => renderCard(o, i))}</div>
                </div>
              ))}
            </div>
          )
        })()}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{page * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE + orders.length, total)} из {total}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="nav-glass text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-40" style={{ color: 'var(--nav-text-primary)' }}>Назад</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE + orders.length >= total}
                className="nav-glass text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-40" style={{ color: 'var(--nav-text-primary)' }}>Дальше</button>
            </div>
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}

export default function KaspiShopOrders() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <KaspiShopOrdersInner />
    </Suspense>
  )
}
