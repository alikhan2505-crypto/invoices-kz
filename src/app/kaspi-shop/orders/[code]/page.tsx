'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'

const EASE = [0.16, 1, 0.3, 1] as const

type OrderDetail = {
  code: string
  status: string
  creationTime: string
  totalPrice: number
  customerFirstName: string
  customerLastName: string
  cityName: string | null
  plannedDeliveryDate: string | null
  items: { code: string; name: string; imageUrl: string | null; quantity: number }[]
}

export default function KaspiShopOrderDetail() {
  const router = useRouter()
  const { code } = useParams()
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading && code) loadOrder() }, [loading, code])

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

  async function loadOrder() {
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/orders/${code}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить заказ'); return }
      setOrder(data)
    } catch {
      setLoadError('Не удалось загрузить заказ. Проверьте соединение и попробуйте ещё раз.')
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-[#F6F6FB] lg:flex">
      <KaspiShopSidebar active="orders" />

      <div className="flex-1 min-w-0 pt-16 px-4 pb-24 lg:px-6 lg:pb-6 max-w-2xl">
        <button onClick={() => router.back()} className="text-sm text-gray-400 mb-4">‹ Назад к заказам</button>

        {loadError && (
          <div className="bg-red-50 rounded-2xl p-4 text-sm text-red-600 mb-4">{loadError}</div>
        )}

        {!order ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">Загружаем заказ...</div>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
              className="bg-[#12142E] rounded-[28px] p-6 lg:p-8 mb-4 text-white">
              <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-1">Заказ № {order.code}</div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-4">{order.customerFirstName} {order.customerLastName}</h1>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
                {order.cityName && <div>📍 {order.cityName}</div>}
                {order.plannedDeliveryDate && <div>🚚 до {new Date(order.plannedDeliveryDate).toLocaleDateString('ru-KZ')}</div>}
                <div>{new Date(order.creationTime).toLocaleString('ru-KZ')}</div>
              </div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums mt-4">{order.totalPrice.toLocaleString('ru-KZ')} ₸</div>
            </motion.div>

            <div className="space-y-2">
              {order.items.map((item, i) => (
                <motion.div key={item.code + i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE, delay: i * 0.05 }}
                  className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-100 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-800 line-clamp-2">{item.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">× {item.quantity}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
