'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Offer = {
  sku: string
  masterSku: string | null
  title: string
  brandName: string | null
  minPrice: number
}

type Tab = 'active' | 'removed'

// Per-row lifecycle: idle -> busy (request in flight) -> sent (Kaspi
// accepted, processes asynchronously -- the cabinet's own UI shows the same
// «В обработке» state, usually done within the hour).
type RowState = 'idle' | 'busy' | 'sent'

function RestoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 5v14M15 5v14" />
    </svg>
  )
}

export default function KaspiShopProductAvailability() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [active, setActive] = useState<Offer[]>([])
  const [removed, setRemoved] = useState<Offer[]>([])
  const [tab, setTab] = useState<Tab>('removed')
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }

    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/removed-products', { headers })
      const data = await res.json()
      if (!res.ok) {
        setLoadError(data.error || 'Не удалось загрузить товары')
      } else {
        setActive(data.active || [])
        setRemoved(data.removed || [])
        // Mirror the cabinet's own default: land on whichever side has items,
        // preferring the removed side only when it's the one with content.
        if ((data.removed || []).length === 0 && (data.active || []).length > 0) setTab('active')
      }
    } catch {
      setLoadError('Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  async function toggle(sku: string, action: 'restore' | 'remove') {
    setRowStates(prev => ({ ...prev, [sku]: 'busy' }))
    setRowErrors(prev => ({ ...prev, [sku]: '' }))
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/removed-products', { method: 'POST', headers, body: JSON.stringify({ sku, action }) })
    const data = await res.json()
    if (!res.ok) {
      setRowStates(prev => ({ ...prev, [sku]: 'idle' }))
      setRowErrors(prev => ({ ...prev, [sku]: data.error || 'Не удалось выполнить операцию' }))
      return
    }
    setRowStates(prev => ({ ...prev, [sku]: 'sent' }))
  }

  if (loading) return <LoadingSpinner />

  const offers = tab === 'removed' ? removed : active

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Kaspi Bot</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Управление товарами</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--nav-text-secondary)' }}>
            Снимайте товары с продажи и возвращайте обратно — как в кабинете Kaspi, но прямо отсюда. Обе операции Kaspi
            обрабатывает сам, обычно в течение часа. При снятии с продажи правило демпинга для товара автоматически
            выключается, чтобы репрайсер случайно не вернул его в продажу.
          </p>
        </motion.div>

        <div className="flex items-center gap-1.5 mb-4">
          {([['removed', `Сняты с продажи (${removed.length})`], ['active', `В продаже (${active.length})`]] as [Tab, string][]).map(([key, label]) => {
            const selected = tab === key
            return (
              <button key={key} onClick={() => setTab(key)}
                className="relative px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
                style={selected
                  ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                  : { color: 'var(--nav-text-secondary)' }}>
                {label}
              </button>
            )
          })}
        </div>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => { setLoading(true); load() }} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {!loadError && offers.length === 0 && (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
              {tab === 'removed' ? 'Снятых с продажи товаров нет' : 'Товаров в продаже нет'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
              {tab === 'removed' ? 'Все товары активного магазина сейчас в продаже.' : 'Недавно отправленные товары Kaspi может ещё обрабатывать.'}
            </div>
          </div>
        )}

        {/* Same card grid as the Демпинг page (2026-08-21 founder request)
            -- compact cards, up to 4 per row on wide screens. */}
        <div className="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
          {offers.map((offer, i) => {
            const state = rowStates[offer.sku] || 'idle'
            const error = rowErrors[offer.sku]
            const action = tab === 'removed' ? 'restore' : 'remove'
            return (
              <motion.div key={offer.sku}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: EASE }}
                className="nav-glass rounded-2xl p-4">
                <div className="text-sm font-semibold truncate" title={offer.title} style={{ color: 'var(--nav-text-primary)' }}>{offer.title}</div>
                <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                  {offer.brandName ? `${offer.brandName} · ` : ''}{offer.sku}
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Цена</div>
                    <div className="font-mono font-bold text-xl tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                      {offer.minPrice.toLocaleString('ru-KZ')} ₸
                    </div>
                  </div>
                  {state === 'sent' ? (
                    <span className="text-[11px] font-semibold rounded-full px-3 py-2 text-center" style={{ background: 'var(--nav-success)', color: '#fff' }}>
                      Kaspi обрабатывает
                    </span>
                  ) : action === 'restore' ? (
                    <button onClick={() => toggle(offer.sku, 'restore')} disabled={state === 'busy'}
                      className="text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-1.5 transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      <RestoreIcon />
                      {state === 'busy' ? 'Отправляем…' : 'Вернуть в продажу'}
                    </button>
                  ) : (
                    <button onClick={() => toggle(offer.sku, 'remove')} disabled={state === 'busy'}
                      className="nav-glass text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-1.5 transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                      style={{ color: 'var(--nav-critical)' }}>
                      <PauseIcon />
                      {state === 'busy' ? 'Отправляем…' : 'Снять с продажи'}
                    </button>
                  )}
                </div>
                {error && <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
              </motion.div>
            )
          })}
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}
