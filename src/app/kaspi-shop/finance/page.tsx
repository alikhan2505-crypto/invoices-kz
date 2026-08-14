'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'

const EASE = [0.16, 1, 0.3, 1] as const

type FinanceSummary = {
  totalRevenue: number
  orderCount: number
  averageOrderValue: number
  byDay: { date: string; revenue: number; orderCount: number }[]
  truncated: boolean
  sessionExpired: boolean
}

const PERIODS = [7, 30, 90]

export default function KaspiShopFinance() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

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
      const res = await fetch(`/api/kaspi-shop/finance?days=${forDays}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить финансы'); setSummary(null); return }
      setSummary(data)
    } catch {
      setLoadError('Не удалось загрузить финансы. Проверьте соединение и попробуйте ещё раз.')
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-[#F6F6FB] lg:flex">
      <KaspiShopSidebar active="finance" />

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
              <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-1">Финансы</div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Выручка</h1>
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
          <div className="grid grid-cols-3 gap-3 lg:gap-6">
            <div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums">{(summary?.totalRevenue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs text-white/40 mt-1">₸ выручка</div>
            </div>
            <div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums">{summary?.orderCount ?? 0}</div>
              <div className="text-xs text-white/40 mt-1">заказов</div>
            </div>
            <div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums">{Math.round(summary?.averageOrderValue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs text-white/40 mt-1">₸ средний чек</div>
            </div>
          </div>
          {summary?.truncated && (
            <div className="text-[11px] text-white/40 mt-4">Учтены последние 200 заказов на статус — на большом объёме сумма может быть неполной.</div>
          )}
        </motion.div>

        {summaryLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">Считаем...</div>
        ) : !summary || summary.byDay.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="text-sm text-gray-500">За этот период выполненных заказов нет.</div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
            {[...summary.byDay].reverse().map(d => (
              <div key={d.date} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-600">{d.date}</span>
                <span className="text-xs text-gray-400">{d.orderCount} {d.orderCount === 1 ? 'заказ' : 'заказов'}</span>
                <span className="font-mono font-semibold text-sm text-[#1C2056] tabular-nums">{d.revenue.toLocaleString('ru-KZ')} ₸</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 flex items-center justify-between z-40">
        <div className="text-xs font-semibold text-[#1C2056]">Финансы</div>
      </div>
    </main>
  )
}
