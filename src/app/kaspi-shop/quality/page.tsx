'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'
import { getActivePlan } from '@/lib/plan'
import { metricDisplay, averageFromStatistics, type RatingStatistics } from '@/lib/kaspiShop/qualityView'
import { usePageDocumentTitle } from '@/lib/usePageDocumentTitle'
import PageHeader from '@/components/PageHeader'
import PageContainer, { TWO_COL_CLS } from '@/components/PageContainer'
import KaspiAccessRetry from '@/components/kaspiShop/KaspiAccessRetry'
import { checkKaspiConnection } from '@/lib/kaspiShop/connectionGuard'

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
  percentage: number
  daysPerPeriod: number
  from: string
  to: string
  notEnoughData: boolean
  numerator: number
  denominator: number
}

type QualityOverview = {
  rating: MetricSummary & { statistics?: RatingStatistics }
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
  // Заголовок вкладки и на время загрузки (PageHeader ещё не отрисован); строка та же, что ставит PageHeader.
  usePageDocumentTitle('Качество')
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [overview, setOverview] = useState<QualityOverview | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<QualityTab>('rating')
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  // Всего категорий по ответу Kaspi и сколько страниц уже загружено («Показать ещё»,
  // раньше грузилась одна страница из 10, аудит K30).
  const [categoriesTotal, setCategoriesTotal] = useState(0)
  const [categoriesNextPage, setCategoriesNextPage] = useState(0)
  const [categoriesLoadingMore, setCategoriesLoadingMore] = useState(false)
  const [categoriesError, setCategoriesError] = useState('')
  // Номер последнего запроса категорий: ответ на устаревший (другая вкладка) не затирает новый.
  const catReqId = useRef(0)
  // Номер последней подгрузки: её finally снимает «Загружаем…» только если за это время
  // не началась новая загрузка категорий или другая подгрузка (смена вкладки в полёте).
  const catMoreReqId = useRef(0)
  const [accessError, setAccessError] = useState('')

  useEffect(() => { init() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // loading в зависимостях: начальная вкладка «rating» не меняется после загрузки, и
  // эффект только от tab никогда не загружал таблицу при первом открытии (аудит K29).
  useEffect(() => { if (!loading) loadCategories(tab) }, [tab, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}` }
  }

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
    if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/upgrade'); return }
    // Демпинг is the only page with the actual connect terminal (phone/OTP)
    // -- every other page redirects there instead of rendering its own broken
    // state when there's no active connection (2026-09-03 founder: check for a
    // connected store before opening any page or sub-page).
    const { data: { session } } = await supabase.auth.getSession()
    // Сбой запроса не равен «не подключён»: показываем «Повторить», а не уводим
    // подключённого продавца на окно подключения (аудит Kaspi 2026-11-06, K12).
    const access = await checkKaspiConnection(session?.access_token)
    if (access.kind === 'error') { setAccessError(access.message); return }
    if (access.kind === 'redirect') { router.push('/kaspi-shop'); return }

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

  // Category table is supplementary -- a failure here shouldn't block the top
  // banner (the number that actually matters), но и молча «Категорий пока нет» он
  // больше не пишет: ошибка видна над таблицей.
  async function loadCategories(t: QualityTab) {
    const id = ++catReqId.current
    // Новая загрузка категорий отменяет подгрузку из прошлой вкладки: её флаг не должен
    // оставаться включённым и блокировать «Показать ещё» на новой вкладке.
    catMoreReqId.current++
    setCategoriesLoadingMore(false)
    setCategoriesLoading(true)
    setCategoriesError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/quality/categories?tab=${t}&page=0`, { headers })
      const data = await res.json().catch(() => ({}))
      if (id !== catReqId.current) return
      if (!res.ok) {
        if (res.status === 400 && /сесси/i.test(data.error || '')) setSessionExpired(true)
        setCategoriesError(data.error || 'Не удалось загрузить категории')
        setCategories([])
        setCategoriesTotal(0)
      } else {
        setCategories(data.categories || [])
        setCategoriesTotal(Number(data.total) || 0)
        setCategoriesNextPage(1)
      }
    } catch {
      if (id !== catReqId.current) return
      setCategoriesError('Не удалось загрузить категории. Проверьте соединение.')
      setCategories([])
      setCategoriesTotal(0)
    } finally {
      if (id === catReqId.current) setCategoriesLoading(false)
    }
  }

  async function loadMoreCategories() {
    if (categoriesLoadingMore || categoriesLoading) return
    const id = catReqId.current
    const moreId = ++catMoreReqId.current
    setCategoriesLoadingMore(true)
    setCategoriesError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/quality/categories?tab=${tab}&page=${categoriesNextPage}`, { headers })
      const data = await res.json().catch(() => ({}))
      if (id !== catReqId.current) return
      if (!res.ok) {
        setCategoriesError(data.error || 'Не удалось загрузить ещё категории')
        return
      }
      const more: CategoryRow[] = data.categories || []
      const seen = new Set(categories.map(c => c.categoryCode))
      const merged = [...categories, ...more.filter(c => !seen.has(c.categoryCode))]
      setCategories(merged)
      setCategoriesTotal(more.length === 0 ? merged.length : (Number(data.total) || merged.length))
      setCategoriesNextPage(p => p + 1)
    } catch {
      if (id !== catReqId.current) return
      setCategoriesError('Не удалось загрузить ещё категории. Проверьте соединение.')
    } finally {
      // Данные устаревшему ответу писать нельзя (guard выше), а флаг снимаем всегда,
      // если это ещё последняя подгрузка.
      if (moreId === catMoreReqId.current) setCategoriesLoadingMore(false)
    }
  }

  if (loading) {
    return accessError
      ? <KaspiAccessRetry message={accessError} onRetry={() => { setAccessError(''); init() }} />
      : <LoadingSpinner />
  }

  const metric = overview?.[tab]
  const activeTab = TABS.find(t => t.value === tab)!

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />

      <PageContainer variant="full" className="flex-1 min-w-0 pb-6">
        <PageHeader title="Качество" subtitle="Показатели качества" />
        {sessionExpired && <SessionExpiredBanner />}

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

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 hide-scrollbar tabs-scroll-fade">
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

        {/* xl+: карточка показателя слева, список категорий справа; уже xl -- друг под другом */}
        <div className={`${TWO_COL_CLS} xl:items-start`}>
        {metric && (() => {
          const display = metricDisplay(activeTab.unit, metric, overview?.rating?.statistics)
          const isRating = activeTab.unit === 'rating'
          const sample = isRating ? averageFromStatistics(overview?.rating?.statistics).count : 0
          return (
          <div className="nav-glass rounded-2xl p-5">
            {metric.notEnoughData || display.value === null ? (
              <div className="text-sm mb-2" style={{ color: 'var(--nav-text-secondary)' }}>
                Kaspi пока не считает этот показатель: данных за период недостаточно.
              </div>
            ) : (
              <div className="flex items-center gap-4 mb-2 flex-wrap">
                <div className="font-mono font-bold text-3xl tabular-nums" style={{ color: zoneColor(metric.zonePercentage) }}>
                  {isRating ? display.value.toFixed(1) : `${display.value.toLocaleString('ru-KZ', { maximumFractionDigits: 1 })}%`}
                </div>
                <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                  {isRating
                    ? `цель Kaspi: не ниже ${display.target.toFixed(1)}; санкции ниже ${display.limit.toFixed(1)}`
                    : `цель Kaspi: не выше ${display.target}%; санкции выше ${display.limit}%`}
                </div>
              </div>
            )}
            <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
              {/* Rating has no natural "out of N" denominator the way a
                  violation-count metric does (returns/delays/cancellations are
                  genuinely X out of Y orders) -- Kaspi's own formulaElements
                  sends denominator: 0 for rating (confirmed live 2026-09-03 on
                  Abil-Sisters' real 245-review history, previously untested
                  since earlier captures only had trivial rating data), which
                  rendered as the nonsensical "245 из 0". */}
              {isRating
                ? `${metric.numerator} оценок за последние ${metric.daysPerPeriod} дней${sample > 0 && sample !== metric.numerator ? `, среднее по ${sample} оценкам` : ''}`
                : `${metric.numerator} из ${metric.denominator} за последние ${metric.daysPerPeriod} дней`}
              {metric.from && metric.to && ` (${formatDateRu(metric.from)} — ${formatDateRu(metric.to)})`}
            </div>
          </div>
          )
        })()}

        <div className={`nav-glass rounded-2xl overflow-hidden min-w-0 ${metric ? '' : 'xl:col-span-2'}`}>
          <div className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--nav-text-primary)', borderBottom: '1px solid var(--nav-border-soft)' }}>
            По категориям
          </div>
          {categoriesError && (
            <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
              <span className="text-xs" style={{ color: 'var(--nav-critical)' }}>{categoriesError}</span>
              <button onClick={() => (categories.length > 0 ? loadMoreCategories() : loadCategories(tab))}
                className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
            </div>
          )}
          {categoriesLoading ? (
            <div className="p-6 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем...</div>
          ) : categories.length === 0 ? (
            categoriesError ? null : (
              <div className="p-6 text-center text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Категорий пока нет.</div>
            )
          ) : (
            categories.map(c => (
              <div key={c.categoryCode} className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                <span className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{c.categoryDisplayName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                    {c.metric?.notEnoughData ? 'Недостаточно данных' : `${c.metric?.violatedCount ?? 0} из ${c.metric?.totalCount ?? 0}`}
                  </span>
                  {c.performanceStatus && (
                    <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: 'var(--nav-success-solid)', color: 'var(--nav-success-ink)' }}>
                      {c.performanceStatus}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          {!categoriesLoading && categories.length > 0 && (
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>Показано {categories.length} из {Math.max(categoriesTotal, categories.length)}</span>
              {categories.length < categoriesTotal && (
                <button onClick={loadMoreCategories} disabled={categoriesLoadingMore}
                  className="text-xs font-semibold rounded-full px-4 py-2 disabled:opacity-50"
                  style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
                  {categoriesLoadingMore ? 'Загружаем…' : 'Показать ещё'}
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      </PageContainer>
    </main>
    </DesktopShell>
  )
}
