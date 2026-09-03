'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'

const EASE = [0.16, 1, 0.3, 1] as const

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17V6a1 1 0 0 1 1-1h9v12" />
      <path d="M13 9h4l3 3v5h-2" />
      <circle cx="7.5" cy="17.5" r="1.7" />
      <circle cx="16.5" cy="17.5" r="1.7" />
    </svg>
  )
}

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
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6 max-w-2xl">
        <button onClick={() => router.back()} className="text-sm mb-4 transition-colors" style={{ color: 'var(--nav-text-muted)' }}>‹ Назад к заказам</button>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 text-sm mb-4" style={{ color: 'var(--nav-critical)' }}>{loadError}</div>
        )}

        {!order ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем заказ...</div>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
              className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
              <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Заказ № {order.code}</div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-4" style={{ color: 'var(--nav-text-primary)' }}>{order.customerFirstName} {order.customerLastName}</h1>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                {order.cityName && <div className="flex items-center gap-1.5"><PinIcon />{order.cityName}</div>}
                {order.plannedDeliveryDate && <div className="flex items-center gap-1.5"><TruckIcon />до {new Date(order.plannedDeliveryDate).toLocaleDateString('ru-KZ')}</div>}
                <div>{new Date(order.creationTime).toLocaleString('ru-KZ')}</div>
              </div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums mt-4" style={{ color: 'var(--nav-text-primary)' }}>{order.totalPrice.toLocaleString('ru-KZ')} ₸</div>
            </motion.div>

            <div className="space-y-2">
              {order.items.map((item, i) => (
                <motion.div key={item.code + i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE, delay: i * 0.05 }}
                  className="nav-glass rounded-2xl p-3 flex items-center gap-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                  ) : (
                    <div className="w-16 h-16 rounded-xl flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold line-clamp-2" style={{ color: 'var(--nav-text-primary)' }}>{item.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>× {item.quantity}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
