'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Product = { nmId: number; name: string; price: number; discount: number; discountedPrice: number }

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₽'
}

export default function WildberriesProductsPage() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Authorization': `Bearer ${session?.access_token}` }
      const res = await fetch('/api/wildberries/products', { headers })
      if (res.status === 404) { setNotConnected(true); setLoading(false); return }
      if (res.ok) {
        const data = await res.json()
        setProducts(Array.isArray(data.products) ? data.products : [])
      } else {
        setError('Не удалось загрузить товары. Попробуйте обновить страницу.')
      }
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (notConnected) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>
        Сначала подключите Wildberries на <a href="/wildberries" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>странице подключения</a>
      </div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-4xl mx-auto p-4 lg:p-6 pb-6">
        <motion.div
          className="mb-4"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Товары</h1>
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            Реальная цена на витрине может быть ниже — Wildberries добавляет свою скидку (СПП), которая не видна через API продавца
          </p>
        </motion.div>

        {error && <div className="text-sm py-4" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

        {!error && products.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Товары не найдены</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map((p, i) => (
              <motion.div
                key={p.nmId}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.03, 0.3) }}
                className="nav-glass rounded-2xl p-4"
              >
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{p.name}</div>
                <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>nmID: {p.nmId}</div>
                <div className="text-base font-bold" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(p.discountedPrice || p.price)}</div>
                {p.discount > 0 && (
                  <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>Цена без скидки: {formatPrice(p.price)} (−{p.discount}%)</div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
