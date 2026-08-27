'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Order = {
  id: string; productName: string; price: number
  buyerName: string; buyerPhone: string; buyerAddress: string
  status: string; createdAt: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Ждёт оплаты', color: 'var(--nav-text-muted)' },
  paid: { label: 'Оплачен', color: 'var(--nav-success)' },
  expired: { label: 'Истёк', color: 'var(--nav-critical)' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-KZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

export default function KaspiShopStorefrontOrders() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Authorization': `Bearer ${session?.access_token}` }
      const res = await fetch('/api/kaspi-shop/storefront-orders', { headers })
      if (res.ok) {
        const data = await res.json()
        setOrders(Array.isArray(data.orders) ? data.orders : [])
      }
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-4xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="mb-6"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Заказы витрины</h1>
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Заказы, оформленные напрямую через вашу витрину</p>
        </motion.div>

        {orders.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Пока нет заказов с витрины</div>
        ) : (
          <div className="space-y-2">
            {orders.map((o, i) => {
              const status = STATUS_LABEL[o.status] || STATUS_LABEL.pending_payment
              return (
                <motion.div
                  key={o.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.03, 0.3) }}
                  className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{o.productName} — {formatPrice(o.price)}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>{o.buyerName} · {o.buyerPhone} · {o.buyerAddress}</div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>{formatDate(o.createdAt)}</div>
                  </div>
                  <span className="text-xs font-bold" style={{ color: status.color }}>{status.label}</span>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
