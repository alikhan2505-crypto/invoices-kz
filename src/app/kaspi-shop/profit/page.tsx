'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'
import { KASPI_CATEGORY_COMMISSIONS } from '@/lib/kaspiShop/margin'
import { getActivePlan } from '@/lib/plan'

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
  commissionCategoryLabel: string | null
  commissionRatePercent: number | null
  commissionAmount: number | null
  profit: number | null
}

type ProfitSummary = {
  products: ProductProfit[]
  totalRevenue: number
  totalCogsKnown: number
  productsWithoutCogsCount: number
  adSpend: number
  otherExpenses: number
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
  const [savingCogsFor, setSavingCogsFor] = useState<string | null>(null)
  const [cogsInputs, setCogsInputs] = useState<Record<string, string>>({})
  const [savingCategoryFor, setSavingCategoryFor] = useState<string | null>(null)
  // «Расходы периода» modal: реклама + прочие (аренда, электроэнергия…),
  // one save per период-окно (founder request 2026-08-21).
  const [expensesOpen, setExpensesOpen] = useState(false)
  const [adInput, setAdInput] = useState('')
  const [otherInput, setOtherInput] = useState('')
  const [savingExpenses, setSavingExpenses] = useState(false)

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading) loadSummary(days) }, [days, loading])

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
    if (!connData?.connected || connData?.sessionStatus === 'session_expired') { router.push('/kaspi-shop'); return }
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
      setAdInput(data.adSpendConfigured ? String(data.adSpend) : '')
      setOtherInput(data.adSpendConfigured ? String(data.otherExpenses ?? 0) : '')
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

  async function saveExpenses() {
    setSavingExpenses(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/profit/ad-spend', {
        method: 'PATCH', headers,
        body: JSON.stringify({ days, amount: Number(adInput) || 0, otherAmount: Number(otherInput) || 0 }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось сохранить расходы')
        return
      }
      setExpensesOpen(false)
      await loadSummary(days)
    } catch {
      setLoadError('Не удалось сохранить расходы. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSavingExpenses(false)
    }
  }

  // Keyed by kaspiMasterSku (works for ANY sold product, in демпинге or
  // not) -- «не везде могу поменять себестоимость» closed 2026-08-21.
  async function saveCogs(kaspiMasterSku: string) {
    const raw = cogsInputs[kaspiMasterSku]
    const value = raw === undefined || raw.trim() === '' ? null : Number(raw)
    setSavingCogsFor(kaspiMasterSku)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/profit/cogs', { method: 'PATCH', headers, body: JSON.stringify({ kaspiMasterSku, cogsAmount: value }) })
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

  // Same master-sku-keyed override as saveCogs -- saves immediately on
  // select (no separate confirm button, unlike the free-text COGS input)
  // since a dropdown pick is already a complete, unambiguous choice.
  async function saveCategory(kaspiMasterSku: string, label: string) {
    setSavingCategoryFor(kaspiMasterSku)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/profit/category', {
        method: 'PATCH', headers,
        body: JSON.stringify({ kaspiMasterSku, commissionCategoryLabel: label || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось сохранить категорию')
        return
      }
      await loadSummary(days)
    } catch {
      setLoadError('Не удалось сохранить категорию. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSavingCategoryFor(null)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
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

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
            <div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{(summary?.totalRevenue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ выручка</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{(summary?.totalCogsKnown ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ себестоимость</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{(summary?.adSpend ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                ₸ реклама · <button onClick={() => setExpensesOpen(true)} className="underline underline-offset-2" style={{ color: 'var(--nav-accent)' }}>изменить</button>
              </div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{(summary?.otherExpenses ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                ₸ прочие расходы · <button onClick={() => setExpensesOpen(true)} className="underline underline-offset-2" style={{ color: 'var(--nav-accent)' }}>изменить</button>
              </div>
            </div>
            {(() => {
              const hasFlatRate = summary?.commissionRatePercent !== null && summary?.commissionRatePercent !== undefined
              // Some products can now carry their own category-based rate
              // (2026-09-02) -- the flat % here only ever applies to whatever
              // revenue isn't covered by one, see profit.ts's blendedCommission.
              const hasAnyCategorized = !!summary?.products.some(p => p.commissionCategoryLabel)
              return (
                <div>
                  <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                    {(summary?.commissionAmount ?? 0).toLocaleString('ru-KZ')}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                    ₸ комиссия{hasFlatRate
                      ? (hasAnyCategorized ? ` (${summary!.commissionRatePercent}% на остальное)` : ` (${summary!.commissionRatePercent}%)`)
                      : (hasAnyCategorized ? ' (по категориям)' : '')}
                  </div>
                  {!hasFlatRate && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input value={commissionInput} onChange={e => setCommissionInput(e.target.value)} placeholder="%"
                        className={`w-16 ${INPUT_CLS}`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                      <button onClick={saveCommission} className="text-xs font-medium rounded-lg px-2 py-1 flex items-center justify-center" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}><CheckIcon /></button>
                    </div>
                  )}
                  {!hasFlatRate && !hasAnyCategorized && (
                    <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>укажите комиссию Kaspi</div>
                  )}
                </div>
              )
            })()}
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
            <div className="text-[11px] px-1 mb-2" style={{ color: 'var(--nav-text-muted)' }}>
              Прибыль по товару — выручка минус себестоимость минус комиссия (реклама не делится по товарам). Укажите категорию Kaspi, чтобы считать комиссию по реальной ставке вместо общего процента сверху.
            </div>
            {/* Compact cards (founder 2026-08-21: no photo background, half
                the width): small thumb + name + cogs input, dense grid.
                Себестоимость is editable for EVERY product (keyed by
                masterSku), tracked in демпинге or not. Category select added
                2026-09-02 (audit finding: the one flat commission % above
                can't be accurate for a catalog spanning several categories)
                -- picking one here computes THIS product's own commission
                from Kaspi's real per-category rate instead of the flat %. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2.5">
              {summary.products.map(p => (
                <div key={p.kaspiMasterSku} className="nav-glass rounded-2xl p-3 flex flex-col">
                  <div className="flex items-start gap-2 mb-2">
                    {p.imageUrl && (
                      <img src={p.imageUrl} alt={p.productName} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                    )}
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold line-clamp-2" title={p.productName} style={{ color: 'var(--nav-text-primary)' }}>{p.productName || p.kaspiMasterSku}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{p.unitsSold} шт · {p.revenue.toLocaleString('ru-KZ')} ₸</div>
                    </div>
                  </div>

                  <label className="block mt-auto">
                    <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Себестоимость за шт.</span>
                    <div className="flex items-center gap-1">
                      <input
                        value={cogsInputs[p.kaspiMasterSku] ?? (p.cogsAmount !== null ? String(p.cogsAmount) : '')}
                        onChange={e => setCogsInputs(prev => ({ ...prev, [p.kaspiMasterSku]: e.target.value }))}
                        placeholder="₸"
                        className={`w-full min-w-0 ${INPUT_CLS}`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                      <button onClick={() => saveCogs(p.kaspiMasterSku)} disabled={savingCogsFor === p.kaspiMasterSku}
                        className="flex-shrink-0 text-xs font-medium rounded-lg px-2 py-1.5 flex items-center justify-center disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}><CheckIcon /></button>
                    </div>
                  </label>

                  <label className="block mt-2">
                    <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Категория Kaspi</span>
                    <select
                      value={p.commissionCategoryLabel || ''}
                      disabled={savingCategoryFor === p.kaspiMasterSku}
                      onChange={e => saveCategory(p.kaspiMasterSku, e.target.value)}
                      className={`w-full min-w-0 ${INPUT_CLS} disabled:opacity-50`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}>
                      <option value="">Общий процент</option>
                      {KASPI_CATEGORY_COMMISSIONS.map(c => <option key={c.label} value={c.label}>{c.label} — {c.ratePercent}%</option>)}
                    </select>
                  </label>

                  <div className="pt-2 flex items-baseline justify-between gap-1">
                    <span className="text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>
                      Прибыль{p.commissionAmount !== null && ` (−${p.commissionAmount.toLocaleString('ru-KZ')} ₸ комиссия)`}
                    </span>
                    <span className="font-mono font-bold text-xs tabular-nums truncate" style={{ color: 'var(--nav-text-primary)' }}>
                      {p.profit !== null ? `${p.profit.toLocaleString('ru-KZ')} ₸` : <span className="text-[10px] font-normal" style={{ color: 'var(--nav-text-muted)' }}>укажите себест.</span>}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* «Расходы периода» -- реклама + прочие (аренда, электроэнергия,
          упаковка…) за выбранное окно 7/30/90 дней. */}
      {expensesOpen && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30" onClick={() => setExpensesOpen(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="relative nav-glass rounded-[24px] w-full max-w-sm"
            style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
            onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
            <div className="p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>Расходы за {days} дн.</div>
                <button onClick={() => setExpensesOpen(false)} className="text-lg leading-none" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
              </div>
              <p className="text-[11px] mb-4" style={{ color: 'var(--nav-text-muted)' }}>
                Вносятся вручную и вычитаются из прибыли за выбранный период.
              </p>
              <label className="block mb-3">
                <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Реклама, ₸</span>
                <input type="number" value={adInput} onChange={e => setAdInput(e.target.value)} placeholder="0"
                  className={`w-full ${INPUT_CLS}`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              </label>
              <label className="block mb-4">
                <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Прочие расходы, ₸ (аренда, электроэнергия, упаковка…)</span>
                <input type="number" value={otherInput} onChange={e => setOtherInput(e.target.value)} placeholder="0"
                  className={`w-full ${INPUT_CLS}`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              </label>
              <button onClick={saveExpenses} disabled={savingExpenses}
                className="w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {savingExpenses ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
    </DesktopShell>
  )
}
