'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'
import { getActivePlan } from '@/lib/plan'

const EASE = [0.16, 1, 0.3, 1] as const

type RefundTab = 'NEW' | 'ON_DELIVERY' | 'WAITING_DECISION' | 'DISPUTE' | 'CLOSED'

const TABS: { value: RefundTab; label: string }[] = [
  { value: 'NEW', label: 'Новые' },
  { value: 'ON_DELIVERY', label: 'На доставке' },
  { value: 'WAITING_DECISION', label: 'Ожидают решения' },
  { value: 'DISPUTE', label: 'Споры' },
  { value: 'CLOSED', label: 'Закрытые заявки' },
]

// Tabs where an unresolved refund actually needs the seller's attention --
// used to pick a more useful default tab than always opening on Новые when
// it happens to be empty (mirrors the Заказы page's "show me something
// useful first" instinct).
const ATTENTION_TABS: RefundTab[] = ['NEW', 'ON_DELIVERY', 'WAITING_DECISION', 'DISPUTE']

type RefundListItem = {
  refundId: string
  applicationNumber: string
  order: string
  productSku: string
  customer: string
  sum: number
  quantity: number
  reasonDescription: string
  statusText: string
}

type RefundStateStep = {
  title: string
  stepStatus: string | null
  stage: string | null
  result: string | null
  stepType: string | null
  expirationTime: string | null
}

type RefundDetail = {
  refundId: string
  applicationNumber: string
  order: string
  customerName: string
  reasonDescription: string
  quantity: number
  total: number
  totalWithdraw: number
  comment: string | null
  statusText: string
  actions: unknown[]
  stateSteps: RefundStateStep[]
  klTrackUrl: string | null
  imageUrls: string[]
}

// Colors a status pill by matching Kaspi's own status vocabulary, without
// hardcoding the full set of strings it might ever send.
function statusColor(statusText: string): { bg: string; fg: string } {
  const s = statusText.toLowerCase()
  if (s.includes('отменён') || s.includes('отменен')) return { bg: 'var(--nav-surface-glass)', fg: 'var(--nav-text-secondary)' }
  if (s.includes('оформлен') && !s.includes('оформляется')) return { bg: 'var(--nav-success)', fg: '#fff' }
  return { bg: 'var(--nav-accent)', fg: 'var(--nav-accent-ink)' }
}

function stepDotColor(stepStatus: string | null): string {
  if (stepStatus === 'SUCCESS') return 'var(--nav-success)'
  if (stepStatus === 'IN_PROGRESS') return 'var(--nav-accent)'
  return 'var(--nav-border-soft)'
}

export default function KaspiShopRefundsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<RefundTab>('NEW')
  const [refunds, setRefunds] = useState<RefundListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [detail, setDetail] = useState<RefundDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  useEffect(() => { init() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadList(tab) }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}` }
  }

  async function init() {
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
    if (!connData?.connected || connData?.sessionStatus === 'session_expired') { router.push('/kaspi-shop'); return }

    const headers = await authHeader()
    try {
      const res = await fetch('/api/kaspi-shop/refunds/counts', { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data.error || 'Не удалось загрузить счётчики')
      } else {
        const byTab: Record<string, number> = {}
        for (const c of data.counts || []) byTab[c.tab] = c.total
        setCounts(byTab)
        // Default to the first attention tab with real заявки, falling back
        // to Закрытые заявки when everything's quiet.
        const firstBusy = ATTENTION_TABS.find(t => byTab[t] > 0)
        setTab(firstBusy || 'CLOSED')
      }
    } catch {
      setLoadError('Не удалось загрузить данные. Проверьте соединение.')
    }
    setLoading(false)
  }

  async function loadList(t: RefundTab) {
    setListLoading(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/refunds?tab=${t}&page=0`, { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 400 && /сесси/i.test(data.error || '')) setSessionExpired(true)
        setLoadError(data.error || 'Не удалось загрузить заявки')
        setRefunds([])
      } else {
        setRefunds(data.refunds || [])
      }
    } catch {
      setLoadError('Не удалось загрузить заявки. Проверьте соединение.')
      setRefunds([])
    } finally {
      setListLoading(false)
    }
  }

  async function openDetail(item: RefundListItem) {
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/refunds/${encodeURIComponent(item.refundId)}?applicationNumber=${encodeURIComponent(item.applicationNumber)}`, { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDetailError(data.error || 'Не удалось загрузить заявку')
      } else {
        setDetail(data.detail)
      }
    } catch {
      setDetailError('Не удалось загрузить заявку. Проверьте соединение.')
    } finally {
      setDetailLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-6">
        {sessionExpired && <SessionExpiredBanner />}

        <h1 className="text-2xl font-extrabold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Возвраты</h1>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {TABS.map(t => {
            const active = tab === t.value
            return (
              <button key={t.value} onClick={() => setTab(t.value)}
                className="relative overflow-hidden flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors"
                style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)', background: active ? 'transparent' : 'var(--nav-surface-glass)' }}>
                {active && (
                  <motion.span layoutId="refundTabPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{t.label}{!!counts[t.value] && ` ${counts[t.value]}`}</span>
              </button>
            )
          })}
        </div>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => loadList(tab)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {listLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем заявки...</div>
        ) : refunds.length === 0 ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            Заявок в этой вкладке нет.
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
            {refunds.map((r, i) => {
              const colors = statusColor(r.statusText)
              return (
                <motion.div key={r.refundId}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.03, ease: EASE }}
                  onClick={() => openDetail(r)}
                  className="nav-glass rounded-2xl p-4 cursor-pointer transition-transform hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-mono" style={{ color: 'var(--nav-text-muted)' }}>№ {r.applicationNumber}</span>
                    <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={{ background: colors.bg, color: colors.fg }}>{r.statusText}</span>
                  </div>
                  <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-secondary)' }}>
                    {r.customer} · заказ {r.order}
                  </div>
                  <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>{r.reasonDescription}</div>
                  <div className="font-mono font-bold text-lg tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                    {r.sum.toLocaleString('ru-KZ')} ₸
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {(detailLoading || detail || detailError) && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30" onClick={() => { setDetail(null); setDetailError('') }}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="relative nav-glass rounded-[24px] w-full max-w-lg max-h-[86vh] overflow-y-auto"
            style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
            onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
            <div className="p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Заявка на возврат</div>
                <button onClick={() => { setDetail(null); setDetailError('') }} className="text-lg leading-none flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
              </div>

              {detailLoading && <div className="text-xs py-6 text-center" style={{ color: 'var(--nav-text-secondary)' }}>Загружаем заявку…</div>}
              {detailError && <div className="text-xs" style={{ color: 'var(--nav-critical)' }}>{detailError}</div>}

              {detail && (
                <>
                  <div className="text-sm font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>№ {detail.applicationNumber}</div>
                  <div className="text-[11px] mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
                    {detail.customerName} · <a href={`https://kaspi.kz/mc/#/orders/${detail.order}`} target="_blank" rel="noreferrer" className="underline">заказ {detail.order}</a>
                  </div>

                  <div className="rounded-xl p-3 mb-4 flex items-center justify-between gap-3" style={{ background: 'var(--nav-bg)' }}>
                    <div>
                      <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Цена товара</div>
                      <div className="font-mono font-bold" style={{ color: 'var(--nav-text-primary)' }}>{detail.total.toLocaleString('ru-KZ')} ₸</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Ваша выплата</div>
                      <div className="font-mono font-bold" style={{ color: 'var(--nav-accent)' }}>{detail.totalWithdraw.toLocaleString('ru-KZ')} ₸</div>
                    </div>
                  </div>

                  <div className="text-[11px] mb-1" style={{ color: 'var(--nav-text-muted)' }}>Причина возврата</div>
                  <div className="text-sm mb-1" style={{ color: 'var(--nav-text-primary)' }}>{detail.reasonDescription}</div>
                  {detail.comment && <div className="text-[11px] mb-4" style={{ color: 'var(--nav-text-secondary)' }}>«{detail.comment}»</div>}

                  {detail.imageUrls.length > 0 && (
                    <div className="flex gap-2 mb-4 overflow-x-auto">
                      {detail.imageUrls.map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={url} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                      ))}
                    </div>
                  )}

                  {detail.stateSteps.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[11px] font-semibold mb-2" style={{ color: 'var(--nav-text-muted)' }}>Ход заявки</div>
                      {detail.stateSteps.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: stepDotColor(s.stepStatus) }} />
                          <div>
                            <div className="text-xs" style={{ color: 'var(--nav-text-primary)' }}>{s.title}</div>
                            {s.expirationTime && <div className="text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>{new Date(s.expirationTime).toLocaleDateString('ru-KZ')}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.klTrackUrl && (
                    <a href={detail.klTrackUrl} target="_blank" rel="noreferrer"
                      className="block text-center text-xs font-semibold rounded-xl py-2 mb-2" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
                      Отследить доставку
                    </a>
                  )}

                  {/* Phase 1b (deferred, see design doc): the populated shape
                      of `actions` for a pending decision is unconfirmed --
                      surface it as a visible signal, not a guessed button. */}
                  {detail.actions.length > 0 && (
                    <div className="text-xs rounded-xl p-3" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
                      По этой заявке нужно ответить — пока только в кабинете Kaspi.
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </main>
    </DesktopShell>
  )
}
