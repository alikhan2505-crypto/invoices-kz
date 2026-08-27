'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Order = { orderId: number; article: string; createdAt: string; status: string }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-KZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function WildberriesOrdersPage() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [printing, setPrinting] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const headers = await authHeader()
      const res = await fetch('/api/wildberries/orders', { headers })
      if (res.status === 404) { setNotConnected(true); setLoading(false); return }
      if (res.ok) {
        const data = await res.json()
        setOrders(Array.isArray(data.orders) ? data.orders : [])
      } else {
        setError('Не удалось загрузить заказы. Попробуйте обновить страницу.')
      }
      setLoading(false)
    }
    load()
  }, [router])

  function toggleSelected(orderId: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId)
      return next
    })
  }

  async function printStickers() {
    if (selected.size === 0) return
    setPrinting(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/wildberries/orders/stickers', {
        method: 'POST', headers, body: JSON.stringify({ orderIds: Array.from(selected) }),
      })
      if (!res.ok) { setError('Не удалось получить этикетки.'); return }
      const data = await res.json()
      const stickers: string[] = Array.isArray(data.stickers) ? data.stickers : []
      stickers.forEach((base64, i) => {
        const link = document.createElement('a')
        link.href = `data:image/png;base64,${base64}`
        link.download = `wb-sticker-${i + 1}.png`
        link.click()
      })
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    }
    setPrinting(false)
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (notConnected) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>
        Сначала подключите Wildberries на <a href="/wildberries" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>странице подключения</a>
      </div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-4xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="flex items-center justify-between gap-3 mb-4 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Заказы</h1>
          {selected.size > 0 && (
            <button onClick={printStickers} disabled={printing}
              className="text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {printing ? 'Готовим…' : `Печать этикеток (${selected.size})`}
            </button>
          )}
        </motion.div>

        {error && <div className="text-sm py-4" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

        {!error && orders.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Заказов пока нет</div>
        ) : (
          <div className="space-y-2">
            {orders.map(o => (
              <div key={o.orderId} onClick={() => toggleSelected(o.orderId)}
                className="nav-glass rounded-2xl p-3 flex items-center gap-3 cursor-pointer"
                style={{ outline: selected.has(o.orderId) ? '2px solid var(--nav-accent)' : 'none', outlineOffset: -2 }}>
                <input type="checkbox" checked={selected.has(o.orderId)} onChange={() => toggleSelected(o.orderId)} onClick={e => e.stopPropagation()} />
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{o.article}</div>
                  <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>№{o.orderId} · {formatDate(o.createdAt)}</div>
                </div>
                <div className="text-xs font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>{o.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
