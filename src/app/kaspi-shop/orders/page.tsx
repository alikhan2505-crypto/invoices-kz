'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'
import { ORDER_STATUS_TABS, TRANSFER_STATUS } from '@/lib/kaspiShop/orderStatuses'

type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
}

function KaspiShopOrdersInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get('status') || ORDER_STATUS_TABS[0].value

  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState(false)

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading) { loadOrders(status); loadCounts() } }, [status, loading])

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

  async function loadOrders(forStatus: string) {
    setOrdersLoading(true)
    setLoadError('')
    setSelected(new Set())
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/orders?status=${encodeURIComponent(forStatus)}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить заказы'); setOrders([]); return }
      setOrders(data.orders || [])
    } catch (e: any) {
      setLoadError('Не удалось загрузить заказы. Проверьте соединение и попробуйте ещё раз.')
      setOrders([])
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
    <main className="min-h-screen bg-[#F6F6FB] lg:flex">
      <KaspiShopSidebar active="orders" orderStatus={status} orderCounts={counts} />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        <h1 className="text-2xl font-extrabold text-[#1C2056] mb-4">Заказы</h1>

        {loadError && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={() => loadOrders(status)} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">Повторить</button>
          </div>
        )}

        {/* Desktop switches status from the sidebar's own nested subnav
            (matches the real Kaspi cabinet's left-hand layout); mobile has
            no sidebar at all, so it keeps a horizontal tab strip here. */}
        <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-4">
          {ORDER_STATUS_TABS.map(tab => (
            <button key={tab.value} onClick={() => router.push(`/kaspi-shop/orders?status=${tab.value}`)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${status === tab.value ? 'bg-[#1C2056] text-white' : 'bg-white text-gray-500'}`}>
              {tab.label}{!!counts[tab.value] && ` ${counts[tab.value]}`}
            </button>
          ))}
        </div>

        {status === TRANSFER_STATUS && selected.size > 0 && (
          <div className="bg-[#1C2056] rounded-2xl p-3 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-white">Выбрано заказов: {selected.size}</span>
            <button onClick={printWaybills} disabled={printing}
              className="text-xs font-medium bg-white text-[#1C2056] rounded-lg px-3 py-2 disabled:opacity-50">
              {printing ? 'Готовим PDF...' : 'Распечатать все накладные'}
            </button>
          </div>
        )}

        {ordersLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">Загружаем заказы...</div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="text-sm text-gray-500">Заказов в этом статусе нет.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map(o => (
              <div key={o.code} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
                {status === TRANSFER_STATUS && (
                  <input type="checkbox" checked={selected.has(o.code)} onChange={() => toggleSelected(o.code)}
                    className="accent-[#2DC48D] w-4 h-4 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 truncate">№ {o.code} · {o.customerFirstName} {o.customerLastName}</div>
                  <div className="text-[11px] text-gray-400">{o.creationTime}</div>
                </div>
                <span className="font-mono font-bold text-sm text-[#1C2056] tabular-nums flex-shrink-0">{o.totalPrice.toLocaleString('ru-KZ')} ₸</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 flex items-center justify-between z-40">
        <div className="text-xs font-semibold text-[#1C2056]">Заказы</div>
      </div>
    </main>
  )
}

export default function KaspiShopOrders() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <KaspiShopOrdersInner />
    </Suspense>
  )
}
