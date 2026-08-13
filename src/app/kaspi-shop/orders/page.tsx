'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'

type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
}

// Real status codes, read off the cabinet's own sidebar nav links (see
// docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md, section
// 4). Возвраты is a separate query family (refunds, not orders) per the
// same findings doc -- out of scope here, not wired up as a dead tab.
const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'Новые', value: 'NEW' },
  { label: 'На подписании', value: 'SIGN_REQUIRED' },
  { label: 'Самовывоз', value: 'PICKUP' },
  { label: 'Моя доставка', value: 'DELIVERY' },
  { label: 'Предзаказ', value: 'KASPI_DELIVERY_WAIT_FOR_POINT_DELIVERY' },
  { label: 'Упаковка', value: 'KASPI_DELIVERY_CARGO_ASSEMBLY' },
  { label: 'Передача', value: 'KASPI_DELIVERY_WAIT_FOR_COURIER' },
  { label: 'Переданы на доставку', value: 'KASPI_DELIVERY_TRANSMITTED' },
  { label: 'Отменены при доставке', value: 'KASPI_DELIVERY_RETURN_REQUEST' },
  { label: 'Архив', value: 'ARCHIVED' },
]

const TRANSFER_STATUS = 'KASPI_DELIVERY_WAIT_FOR_COURIER'

export default function KaspiShopOrders() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(STATUS_TABS[0].value)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState(false)

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading) loadOrders(status) }, [status, loading])

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
      <KaspiShopSidebar active="orders" />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        <h1 className="text-2xl font-extrabold text-[#1C2056] mb-4">Заказы</h1>

        {loadError && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={() => loadOrders(status)} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">Повторить</button>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {STATUS_TABS.map(tab => (
            <button key={tab.value} onClick={() => setStatus(tab.value)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${status === tab.value ? 'bg-[#1C2056] text-white' : 'bg-white text-gray-500'}`}>
              {tab.label}
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
