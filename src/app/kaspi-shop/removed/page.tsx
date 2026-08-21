'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type RemovedOffer = {
  sku: string
  masterSku: string | null
  title: string
  brandName: string | null
  minPrice: number
}

// Per-row lifecycle: idle -> restoring (request in flight) -> sent (Kaspi
// accepted, processes asynchronously -- the cabinet's own UI shows the same
// «В обработке» state, usually done within the hour).
type RowState = 'idle' | 'restoring' | 'sent'

function RestoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}

export default function KaspiShopRemoved() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [offers, setOffers] = useState<RemovedOffer[]>([])
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
        setLoadError(data.error || 'Не удалось загрузить снятые с продажи товары')
      } else {
        setOffers(data.offers || [])
      }
    } catch {
      setLoadError('Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  async function restore(sku: string) {
    setRowStates(prev => ({ ...prev, [sku]: 'restoring' }))
    setRowErrors(prev => ({ ...prev, [sku]: '' }))
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/removed-products', { method: 'POST', headers, body: JSON.stringify({ sku }) })
    const data = await res.json()
    if (!res.ok) {
      setRowStates(prev => ({ ...prev, [sku]: 'idle' }))
      setRowErrors(prev => ({ ...prev, [sku]: data.error || 'Не удалось вернуть товар в продажу' }))
      return
    }
    setRowStates(prev => ({ ...prev, [sku]: 'sent' }))
  }

  if (loading) return <LoadingSpinner />

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Kaspi Bot</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Сняты с продажи</h1>
          <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--nav-text-secondary)' }}>
            Товары вашего магазина, которые сейчас не продаются на Kaspi. Возврат в продажу отправляется прямо в кабинет
            Kaspi — после отправки Kaspi обрабатывает товар сам, обычно в течение часа.
          </p>
        </motion.div>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => { setLoading(true); load() }} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {!loadError && offers.length === 0 && (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Снятых с продажи товаров нет</div>
            <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>Все товары активного магазина сейчас в продаже.</div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {offers.map((offer, i) => {
            const state = rowStates[offer.sku] || 'idle'
            const error = rowErrors[offer.sku]
            return (
              <motion.div key={offer.sku}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: EASE }}
                className="nav-glass rounded-2xl p-4 lg:p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{offer.title}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>
                      {offer.brandName ? `${offer.brandName} · ` : ''}{offer.sku}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                      {offer.minPrice.toLocaleString('ru-KZ')} ₸
                    </div>
                    {state === 'sent' ? (
                      <span className="text-xs font-semibold rounded-full px-3 py-2" style={{ background: 'var(--nav-success)', color: '#fff' }}>
                        Отправлено — Kaspi обрабатывает
                      </span>
                    ) : (
                      <button onClick={() => restore(offer.sku)} disabled={state === 'restoring'}
                        className="text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-1.5 transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        <RestoreIcon />
                        {state === 'restoring' ? 'Отправляем…' : 'Вернуть в продажу'}
                      </button>
                    )}
                  </div>
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
