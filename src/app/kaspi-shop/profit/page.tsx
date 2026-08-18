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
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={() => loadSummary(days)} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="bg-[#12142E] rounded-[28px] p-6 lg:p-8 mb-4 text-white">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-1">Прибыль</div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Юнит-экономика</h1>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 bg-white/10 rounded-full p-1">
              {PERIODS.map(p => (
                <button key={p} onClick={() => setDays(p)}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${days === p ? 'bg-white text-[#12142E]' : 'text-white/60'}`}>
                  {p} дн.
                </button>
              ))}
            </div>
          </div>

          <div className="text-4xl lg:text-5xl font-black font-mono tabular-nums mb-1">
            {(summary?.netProfit ?? 0).toLocaleString('ru-KZ')} <span className="text-lg text-white/40">₸ прибыль</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <div>
              <div className="text-lg font-bold font-mono tabular-nums">{(summary?.totalRevenue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs text-white/40 mt-1">₸ выручка</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono tabular-nums">{(summary?.totalCogsKnown ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs text-white/40 mt-1">₸ себестоимость</div>
            </div>
            <div>
              {summary?.adSpendConfigured ? (
                <>
                  <div className="text-lg font-bold font-mono tabular-nums">{summary.adSpend.toLocaleString('ru-KZ')}</div>
                  <div className="text-xs text-white/40 mt-1">₸ реклама</div>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input value={adSpendInput} onChange={e => setAdSpendInput(e.target.value)} placeholder="0"
                    className="w-20 rounded-lg bg-white/10 text-white placeholder-white/30 px-2 py-1 text-sm outline-none focus:bg-white/15" />
                  <button onClick={saveAdSpend} className="text-xs font-medium bg-white text-[#12142E] rounded-lg px-2 py-1">✓</button>
                </div>
              )}
              <div className="text-xs text-white/40 mt-1">{summary?.adSpendConfigured ? '' : 'укажите расходы на рекламу'}</div>
            </div>
            <div>
              {summary?.commissionRatePercent !== null && summary?.commissionRatePercent !== undefined ? (
                <>
                  <div className="text-lg font-bold font-mono tabular-nums">{summary.commissionAmount.toLocaleString('ru-KZ')}</div>
                  <div className="text-xs text-white/40 mt-1">₸ комиссия ({summary.commissionRatePercent}%)</div>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input value={commissionInput} onChange={e => setCommissionInput(e.target.value)} placeholder="%"
                    className="w-16 rounded-lg bg-white/10 text-white placeholder-white/30 px-2 py-1 text-sm outline-none focus:bg-white/15" />
                  <button onClick={saveCommission} className="text-xs font-medium bg-white text-[#12142E] rounded-lg px-2 py-1">✓</button>
                </div>
              )}
              <div className="text-xs text-white/40 mt-1">{summary?.commissionRatePercent !== null && summary?.commissionRatePercent !== undefined ? '' : 'укажите комиссию Kaspi'}</div>
            </div>
          </div>

          {!!summary && summary.productsWithoutCogsCount > 0 && (
            <div className="text-[11px] text-white/50 mt-4">⚠ {summary.productsWithoutCogsCount} {summary.productsWithoutCogsCount === 1 ? 'товар' : 'товаров'} без себестоимости — прибыль может быть занижена.</div>
          )}
          {summary?.truncated && (
            <div className="text-[11px] text-white/40 mt-2">Учтены последние 200 заказов на статус — на большом объёме сумма может быть неполной.</div>
          )}
        </motion.div>

        {summaryLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">Считаем...</div>
        ) : !summary || summary.products.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="text-sm text-gray-500">За этот период продаж нет.</div>
          </div>
        ) : (
          <>
            <div className="text-[11px] text-gray-400 px-1 mb-2">Прибыль по товару — выручка минус себестоимость (без учёта рекламы и комиссии, которые не делятся по товарам)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {summary.products.map(p => (
                <div key={p.kaspiMasterSku} className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.productName} className="w-full aspect-square object-cover bg-gray-100" />
                  ) : (
                    <div className="w-full aspect-square bg-gray-100" />
                  )}
                  <div className="p-3 flex flex-col flex-1">
                    <div className="text-xs font-semibold text-gray-800 line-clamp-2 min-h-[2.2em]">{p.productName || p.kaspiMasterSku}</div>
                    <div className="text-[11px] text-gray-400 mt-1">{p.unitsSold} шт · {p.revenue.toLocaleString('ru-KZ')} ₸</div>

                    {p.trackedProductId && (
                      <label className="block mt-2">
                        <span className="text-[10px] text-gray-400 mb-1 block">Себестоимость за шт.</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            value={cogsInputs[p.trackedProductId] ?? (p.cogsAmount !== null ? String(p.cogsAmount) : '')}
                            onChange={e => setCogsInputs(prev => ({ ...prev, [p.trackedProductId!]: e.target.value }))}
                            placeholder="₸"
                            className="w-full min-w-0 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 px-2 py-1.5 text-xs outline-none focus:bg-gray-100" />
                          <button onClick={() => saveCogs(p.trackedProductId!)} disabled={savingCogsFor === p.trackedProductId}
                            className="flex-shrink-0 text-xs font-medium bg-[#1C2056] text-white rounded-lg px-2.5 py-1.5 disabled:opacity-50">✓</button>
                        </div>
                      </label>
                    )}

                    <div className="mt-auto pt-2 flex items-baseline justify-between">
                      <span className="text-[10px] text-gray-400">Прибыль</span>
                      <span className="font-mono font-bold text-sm text-[#1C2056] tabular-nums">
                        {p.profit !== null ? `${p.profit.toLocaleString('ru-KZ')} ₸` : <span className="text-gray-400 text-[11px] font-normal">укажите себест.</span>}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 flex items-center justify-between z-40">
        <div className="text-xs font-semibold text-[#1C2056]">Прибыль</div>
      </div>
    </main>
  )
}
