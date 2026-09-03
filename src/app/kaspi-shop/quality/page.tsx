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

type QualityTab = 'rating' | 'returns' | 'lateDelivery' | 'cancellations'

const TABS: { value: QualityTab; label: string; unit: 'rating' | 'percent' }[] = [
  { value: 'rating', label: 'Рейтинг', unit: 'rating' },
  { value: 'returns', label: 'Возвраты по качеству', unit: 'percent' },
  { value: 'lateDelivery', label: 'Задержки при передачах', unit: 'percent' },
  { value: 'cancellations', label: 'Отмены по вашей вине', unit: 'percent' },
]

type MetricSummary = {
  goodValue: number
  violationValue: number
  zonePercentage: number
  daysPerPeriod: number
  from: string
  to: string
  notEnoughData: boolean
  numerator: number
  denominator: number
}

type QualityOverview = {
  rating: MetricSummary
  returns: MetricSummary
  lateDelivery: MetricSummary
  cancellations: MetricSummary
  ordersCount: number
  warning: { generalLevel?: string; signals?: { level: string; metric: string }[] } | null
}

type CategoryRow = {
  categoryCode: string
  categoryDisplayName: string
  performanceStatus: string | null
  metric: { totalCount: number; violatedCount: number; notEnoughData: boolean }
}

// zonePercentage is how close the metric sits to its violation threshold
// (0 = safe, 100 = at the wall) -- this is the "are you at risk" signal
// the репрайсер's whole positioning is built around.
function zoneColor(zonePercentage: number): string {
  if (zonePercentage >= 80) return 'var(--nav-critical)'
  if (zonePercentage >= 50) return 'var(--nav-accent)'
  return 'var(--nav-success)'
}

function formatDateRu(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-KZ', { day: 'numeric', month: 'long' })
}

export default function KaspiShopQualityPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [overview, setOverview] = useState<QualityOverview | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<QualityTab>('rating')
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)

  useEffect(() => { init() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadCategories(tab) }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

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

    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/quality/overview', { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 400 && /сесси/i.test(data.error || '')) setSessionExpired(true)
        setLoadError(data.error || 'Не удалось загрузить показатели')
      } else {
        setOverview(data.overview)
      }
    } catch {
      setLoadError('Не удалось загрузить показатели. Проверьте соединение.')
    }
    setLoading(false)
  }

  async function loadCategories(t: QualityTab) {
    setCategoriesLoading(true)
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/quality/categories?tab=${t}&page=0`, { headers })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setCategories(data.categories || [])
    } catch {
      // Category table is supplementary -- a failure here shouldn't block
      // the top banner (the number that actually matters) from showing.
    } finally {
      setCategoriesLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />

  const metric = overview?.[tab]
  const activeTab = TABS.find(t => t.value === tab)!

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {sessionExpired && <SessionExpiredBanner />}

        <h1 className="text-2xl font-extrabold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Показатели качества</h1>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={init} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {overview?.warning && (
          <div className="nav-glass rounded-2xl p-4 mb-4">
            <div className="text-sm font-semibold" style={{ color: 'var(--nav-critical)' }}>Есть показатели в зоне риска</div>
            {(overview.warning.signals || []).map((s, i) => (
              <div key={i} className="text-xs mt-1" style={{ color: 'var(--nav-text-secondary)' }}>{s.metric}: {s.level}</div>
            ))}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {TABS.map(t => {
            const active = tab === t.value
            return (
              <button key={t.value} onClick={() => setTab(t.value)}
                className="relative overflow-hidden flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors"
                style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)', background: active ? 'transparent' : 'var(--nav-surface-glass)' }}>
                {active && (
                  <motion.span layoutId="qualityTabPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{t.label}</span>
              </button>
            )
          })}
        </div>

        {metric && (
          <div className="nav-glass rounded-2xl p-5 mb-4">
            {metric.notEnoughData ? (
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                Показатель сформируется после {metric.denominator > 0 ? metric.denominator : 10}{' '}
                {activeTab.unit === 'rating' ? 'оценок' : 'заказов'}.
              </div>
            ) : (
              <div className="flex items-center gap-4 mb-2">
                <div className="font-mono font-bold text-3xl tabular-nums" style={{ color: zoneColor(metric.zonePercentage) }}>
                  {activeTab.unit === 'rating' ? metric.goodValue.toFixed(1) : `${metric.goodValue}%`}
                </div>
                <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                  {activeTab.unit === 'rating'
                    ? `не должен быть ниже ${metric.violationValue.toFixed(1)}`
                    : `не должно превышать ${metric.violationValue}%`}
                </div>
              </div>
            )}
            <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
              {metric.numerator} из {metric.denominator} за последние {metric.daysPerPeriod} дней
              {metric.from && metric.to && ` (${formatDateRu(metric.from)} — ${formatDateRu(metric.to)})`}
            </div>
          </div>
        )}

        <div className="nav-glass rounded-2xl overflow-hidden">
          <div className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--nav-text-primary)', borderBottom: '1px solid var(--nav-border-soft)' }}>
            По категориям
          </div>
          {categoriesLoading ? (
            <div className="p-6 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем...</div>
          ) : categories.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Категорий пока нет.</div>
          ) : (
            categories.map(c => (
              <div key={c.categoryCode} className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                <span className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{c.categoryDisplayName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                    {c.metric?.notEnoughData ? 'Недостаточно данных' : `${c.metric?.violatedCount ?? 0} из ${c.metric?.totalCount ?? 0}`}
                  </span>
                  {c.performanceStatus && (
                    <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: 'var(--nav-success)', color: '#fff' }}>
                      {c.performanceStatus}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}
