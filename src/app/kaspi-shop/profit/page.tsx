'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'

const EASE = [0.16, 1, 0.3, 1] as const
const PERIODS = [7, 30, 90]
const INPUT_CLS = 'rounded-lg px-2 py-1 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}

type ProductProfit = {
  kaspiMasterSku: string
  trackedProductId: string | null
  productName: string
  imageUrl: string | null
  unitsSold: number
  revenue: number
  cogsAmount: number | null
  cogsTotal: number | null
  profit: number | null
}

type ProfitSummary = {
  products: ProductProfit[]
  totalRevenue: number
  totalCogsKnown: number
  productsWithoutCogsCount: number
  adSpend: number
  adSpendConfigured: boolean
  commissionRatePercent: number | null
  commissionAmount: number
  netProfit: number
  truncated: boolean
  sessionExpired: boolean
}

export default function KaspiShopProfit() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<ProfitSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [commissionInput, setCommissionInput] = useState('')
  const [adSpendInput, setAdSpendInput] = useState('')
  const [savingCogsFor, setSavingCogsFor] = useState<string | null>(null)
  const [cogsInputs, setCogsInputs] = useState<Record<string, string>>({})

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading) loadSummary(days) }, [days, loading])

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

  async function loadSummary(forDays: number) {
    setSummaryLoading(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/profit?days=${forDays}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить прибыль'); setSummary(null); return }
      setSummary(data)
      setCommissionInput(data.commissionRatePercent !== null ? String(data.commissionRatePercent) : '')
      setAdSpendInput(data.adSpendConfigured ? String(data.adSpend) : '')
    } catch {
      setLoadError('Не удалось загрузить прибыль. Проверьте соединение и попробуйте ещё раз.')
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  async function saveCommission() {
    const value = commissionInput.trim() === '' ? null : Number(commissionInput)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/profit/commission', { method: 'PATCH', headers, body: JSON.stringify({ commissionRatePercent: value }) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось сохранить комиссию')
        return
      }
      await loadSummary(days)
    } catch {
      setLoadError('Не удалось сохранить комиссию. Проверьте соединение и попробуйте ещё раз.')
    }
  }

  async function saveAdSpend() {
    const value = Number(adSpendInput) || 0
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/profit/ad-spend', { method: 'PATCH', headers, body: JSON.stringify({ days, amount: value }) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось сохранить расходы на рекламу')
        return
      }
      await loadSummary(days)
    } catch {
      setLoadError('Не удалось сохранить расходы на рекламу. Проверьте соединение и попробуйте ещё раз.')
    }
  }

  async function saveCogs(trackedProductId: string) {
    const raw = cogsInputs[trackedProductId]
    const value = raw === undefined || raw.trim() === '' ? null : Number(raw)
    setSavingCogsFor(trackedProductId)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/profit/cogs', { method: 'PATCH', headers, body: JSON.stringify({ trackedProductId, cogsAmount: value }) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось сохранить себестоимость')
        return
      }
      await loadSummary(days)
    } catch {
      setLoadError('Не удалось сохранить себестоимость. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSavingCogsFor(null)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="nav-surface-elevated min-h-screen">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {summary?.sessionExpired && <SessionExpiredBanner />}

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => loadSummary(days)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Прибыль</div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Юнит-экономика</h1>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 nav-glass rounded-full p-1">
              {PERIODS.map(p => {
                const active = days === p
                return (
                  <button key={p} onClick={() => setDays(p)}
                    className="relative text-xs font-medium rounded-full px-3 py-1.5 transition-colors"
                    style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                    {active && (
                      <motion.span layoutId="profitPeriodPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)', zIndex: 0 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                    )}
                    <span className="relative" style={{ zIndex: 1 }}>{p} дн.</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="text-4xl lg:text-5xl font-black font-mono tabular-nums mb-1" style={{ color: 'var(--nav-text-primary)' }}>
            {(summary?.netProfit ?? 0).toLocaleString('ru-KZ')} <span className="text-lg" style={{ color: 'var(--nav-text-muted)' }}>₸ прибыль</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{(summary?.totalRevenue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ выручка</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{(summary?.totalCogsKnown ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ себестоимость</div>
            </div>
            <div>
              {summary?.adSpendConfigured ? (
                <>
                  <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{summary.adSpend.toLocaleString('ru-KZ')}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ реклама</div>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input value={adSpendInput} onChange={e => setAdSpendInput(e.target.value)} placeholder="0"
                    className={`w-20 ${INPUT_CLS}`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <button onClick={saveAdSpend} className="text-xs font-medium rounded-lg px-2 py-1 flex items-center justify-center" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}><CheckIcon /></button>
                </div>
              )}
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{summary?.adSpendConfigured ? '' : 'укажите расходы на рекламу'}</div>
            </div>
            <div>
              {summary?.commissionRatePercent !== null && summary?.commissionRatePercent !== undefined ? (
                <>
                  <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{summary.commissionAmount.toLocaleString('ru-KZ')}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ комиссия ({summary.commissionRatePercent}%)</div>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input value={commissionInput} onChange={e => setCommissionInput(e.target.value)} placeholder="%"
                    className={`w-16 ${INPUT_CLS}`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <button onClick={saveCommission} className="text-xs font-medium rounded-lg px-2 py-1 flex items-center justify-center" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}><CheckIcon /></button>
                </div>
              )}
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{summary?.commissionRatePercent !== null && summary?.commissionRatePercent !== undefined ? '' : 'укажите комиссию Kaspi'}</div>
            </div>
          </div>

          {!!summary && summary.productsWithoutCogsCount > 0 && (
            <div className="text-[11px] mt-4 flex items-center gap-1.5" style={{ color: 'var(--nav-text-secondary)' }}>
              <WarnIcon /> {summary.productsWithoutCogsCount} {summary.productsWithoutCogsCount === 1 ? 'товар' : 'товаров'} без себестоимости — прибыль может быть занижена.
            </div>
          )}
          {summary?.truncated && (
            <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>Учтены последние 200 заказов на статус — на большом объёме сумма может быть неполной.</div>
          )}
        </motion.div>

        {summaryLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Считаем...</div>
        ) : !summary || summary.products.length === 0 ? (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>За этот период продаж нет.</div>
          </div>
        ) : (
          <>
            <div className="text-[11px] px-1 mb-2" style={{ color: 'var(--nav-text-muted)' }}>Прибыль по товару — выручка минус себестоимость (без учёта рекламы и комиссии, которые не делятся по товарам)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {summary.products.map(p => (
                <div key={p.kaspiMasterSku} className="nav-glass rounded-2xl overflow-hidden flex flex-col">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.productName} className="w-full aspect-square object-cover" style={{ background: 'var(--nav-bg)' }} />
                  ) : (
                    <div className="w-full aspect-square" style={{ background: 'var(--nav-bg)' }} />
                  )}
                  <div className="p-3 flex flex-col flex-1">
                    <div className="text-xs font-semibold line-clamp-2 min-h-[2.2em]" style={{ color: 'var(--nav-text-primary)' }}>{p.productName || p.kaspiMasterSku}</div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>{p.unitsSold} шт · {p.revenue.toLocaleString('ru-KZ')} ₸</div>

                    {p.trackedProductId && (
                      <label className="block mt-2">
                        <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Себестоимость за шт.</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            value={cogsInputs[p.trackedProductId] ?? (p.cogsAmount !== null ? String(p.cogsAmount) : '')}
                            onChange={e => setCogsInputs(prev => ({ ...prev, [p.trackedProductId!]: e.target.value }))}
                            placeholder="₸"
                            className={`w-full min-w-0 ${INPUT_CLS}`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                          <button onClick={() => saveCogs(p.trackedProductId!)} disabled={savingCogsFor === p.trackedProductId}
                            className="flex-shrink-0 text-xs font-medium rounded-lg px-2.5 py-1.5 flex items-center justify-center disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}><CheckIcon /></button>
                        </div>
                      </label>
                    )}

                    <div className="mt-auto pt-2 flex items-baseline justify-between">
                      <span className="text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>Прибыль</span>
                      <span className="font-mono font-bold text-sm tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                        {p.profit !== null ? `${p.profit.toLocaleString('ru-KZ')} ₸` : <span className="text-[11px] font-normal" style={{ color: 'var(--nav-text-muted)' }}>укажите себест.</span>}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
