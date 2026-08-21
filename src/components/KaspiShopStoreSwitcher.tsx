'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

type Connection = {
  id: string
  merchantId: string
  companyName: string
  status: string
  isActive: boolean
  sessionStatus: string
}

// Fired by kaspi-shop/page.tsx after connect/disconnect so this switcher
// (mounted in SiteNav, a separate component tree) picks up the change
// without needing prop drilling across the two trees.
export const KASPI_SHOP_CONNECTIONS_CHANGED_EVENT = 'kaspi-shop-connections-changed'

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
}

function DoorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M15 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2M10 8l-4 4 4 4M6 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Placed in SiteNav's second (sub-nav) row, right-aligned, only while on a
// Kaspi Bot page -- shows which of the user's connected Kaspi stores is
// active (2026-08-21: real need, one phone with 2 real merchant accounts),
// lets them switch, and a door icon to disconnect the active one.
export default function KaspiShopStoreSwitcher() {
  const router = useRouter()
  const [connections, setConnections] = useState<Connection[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/connections', { headers })
    if (!res.ok) return
    const data = await res.json()
    setConnections(data.connections || [])
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener(KASPI_SHOP_CONNECTIONS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(KASPI_SHOP_CONNECTIONS_CHANGED_EVENT, refresh)
  }, [refresh])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function switchTo(connectionId: string) {
    if (busy) return
    setBusy(true)
    setOpen(false)
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/connections/switch', { method: 'POST', headers, body: JSON.stringify({ connectionId }) })
    // A full reload is deliberate: every Kaspi Bot page loads its data once
    // on mount for "the" active store -- reloading is the simplest way to
    // guarantee all of them reflect the newly-switched store correctly.
    window.location.href = '/kaspi-shop'
  }

  async function disconnectActive() {
    if (busy) return
    if (!confirm('Отключить кабинет Kaspi? Отслеживаемые товары и их настройки будут удалены — при повторном подключении каталог импортируется заново.')) return
    setBusy(true)
    setOpen(false)
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/settings', { method: 'DELETE', headers })
    window.location.href = '/kaspi-shop'
  }

  if (connections.length === 0) return null
  const active = connections.find(c => c.isActive) ?? connections[0]

  // Dead cabinet session (founder request 2026-08-21): the whole pill
  // becomes one clear reconnect button instead of a store name that no
  // longer works -- clicking reuses the standard connect flow, which
  // refreshes the session for the same merchant without duplicates.
  if (active.sessionStatus === 'session_expired') {
    return (
      <div className="relative ml-auto flex-shrink-0">
        <button
          onClick={() => router.push('/kaspi-shop?addStore=1')}
          className="text-[12px] font-semibold rounded-full px-3 py-1.5"
          style={{ background: 'var(--nav-critical)', color: '#fff' }}
        >
          Подключить магазин
        </button>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative ml-auto flex-shrink-0">
      <div className="flex items-center gap-0.5 rounded-full nav-glass pl-1 pr-1 py-1">
        <button
          onClick={disconnectActive}
          disabled={busy}
          title="Отключить магазин"
          className="w-6 h-6 flex items-center justify-center rounded-full transition-colors"
          style={{ color: 'var(--nav-critical)' }}
        >
          <DoorIcon />
        </button>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 pl-1 pr-2 py-1 rounded-full text-[12px] font-medium max-w-[180px]"
          style={{ color: 'var(--nav-text-secondary)' }}
        >
          <span className="truncate">{active.companyName}</span>
          <ChevronIcon />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-[calc(100%+8px)] nav-glass rounded-2xl py-1.5 w-64 z-40"
            style={{ boxShadow: '0 24px 50px -20px rgba(10,10,15,0.35), var(--nav-card-glow)' }}
          >
            <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.07em' }}>
              Магазины Kaspi
            </div>
            {connections.map(c => (
              <button
                key={c.id}
                onClick={() => !c.isActive && switchTo(c.id)}
                disabled={busy}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-black/[0.03]"
                style={{ color: 'var(--nav-text-primary)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.isActive ? 'var(--nav-success)' : 'var(--nav-border-soft)' }} />
                <span className="truncate flex-1">{c.companyName}</span>
                {c.isActive && <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>сейчас</span>}
              </button>
            ))}
            <div className="mt-1 pt-1.5" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
              <button
                onClick={() => { setOpen(false); router.push('/kaspi-shop?addStore=1') }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-black/[0.03]"
                style={{ color: 'var(--nav-accent)' }}
              >
                + Добавить магазин
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
