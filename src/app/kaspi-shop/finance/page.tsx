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
import { almatyDateOf, shiftAlmatyDate, MAX_PERIOD_DAYS } from '@/lib/kaspiShop/almatyDates'
import { usePageDocumentTitle } from '@/lib/usePageDocumentTitle'
import PageHeader from '@/components/PageHeader'
import PageContainer from '@/components/PageContainer'
import KaspiAccessRetry from '@/components/kaspiShop/KaspiAccessRetry'
import { checkKaspiConnection } from '@/lib/kaspiShop/connectionGuard'

const EASE = [0.16, 1, 0.3, 1] as const

type BehavioralAnalytics = {
  byWeekday: { day: number; label: string; orderCount: number; revenue: number }[]
  byHour: { hour: number; orderCount: number }[]
  beforePayday: { orderCount: number; revenue: number }
  afterPayday: { orderCount: number; revenue: number }
  genderEstimate: { male: number; female: number; unknown: number }
  holidayOrders: { date: string; label: string; orderCount: number; revenue: number }[]
}

type AbcRow = {
  code: string
  name: string
  imageUrl: string | null
  unitsSold: number
  revenue: number
  share: number
  cumulativeShare: number
  abcClass: 'A' | 'B' | 'C'
}

type AttributeSlice = { value: string; unitsSold: number; revenue: number }

type FinanceSummary = {
  totalRevenue: number
  orderCount: number
  averageOrderValue: number
  byDay: { date: string; revenue: number; orderCount: number; unitsSold: number }[]
  behavioral: BehavioralAnalytics
  abc: AbcRow[]
  byColor: AttributeSlice[]
  bySize: AttributeSlice[]
  truncated: boolean
  sessionExpired: boolean
  // Kaspi не ответил хотя бы на одну страницу заказов: цифры неполные или неизвестны.
  upstreamFailed?: boolean
  // С какой даты по Алматы посчитан период, сколько заказов получено от Kaspi и шли ли
  // они от новых к старым (определено по данным).
  periodFrom?: string
  fetchedOrders?: number
  newestFirst?: boolean
}

// Период: последние N суток (пресеты) или «с даты» (YYYY-MM-DD, 00:00 по Алматы).
type Period = { kind: 'days'; days: number } | { kind: 'since'; since: string }

function periodQuery(p: Period): string {
  return p.kind === 'days' ? `days=${p.days}` : `since=${p.since}`
}

// «2026-11-01» -> «01.11.2026» (дата без часового пояса: Date тут не нужен).
function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const ABC_COLORS: Record<'A' | 'B' | 'C', string> = {
  A: 'var(--nav-success)',
  B: 'var(--nav-accent)',
  C: 'var(--nav-text-muted)',
}

// Bars + rows for one attribute slice («По цвету» / «По размеру»).
function AttributeSliceCard({ title, slices }: { title: string; slices: AttributeSlice[] }) {
  const maxRevenue = Math.max(...slices.map(s => s.revenue), 1)
  return (
    <div className="nav-glass rounded-2xl p-4">
      <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nav-text-muted)' }}>{title}</div>
      {slices.length === 0 && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>В названиях проданных товаров это не встречается.</div>}
      <div className="space-y-2">
        {slices.slice(0, 8).map(s => (
          <div key={s.value}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: 'var(--nav-text-primary)' }}>{s.value}</span>
              <span className="tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{s.unitsSold} шт · {s.revenue.toLocaleString('ru-KZ')} ₸</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nav-border-soft)' }}>
              <div className="h-full rounded-full" style={{ width: `${(s.revenue / maxRevenue) * 100}%`, background: 'var(--nav-accent)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const PERIODS = [7, 30, 90]

// Self-contained SVG combo chart (this project's established pattern for
// visuals -- PriceLadder on /kaspi-shop is a hand-rolled SVG/CSS gauge too
// -- no charting library dependency). Revenue is the real visual anchor
// (bar height); order count and average-price-per-unit are each drawn on
// their OWN independent 0..1 scale mapped to the same pixel height, since
// their real magnitudes are wildly different from revenue -- this is a
// trend/shape comparison, not a literal shared axis, and the exact real
// numbers for a day are available via the native tooltip on hover.
function FinanceChart({ byDay }: { byDay: FinanceSummary['byDay'] }) {
  // На десктопе (>=1024px) график растягивается на всю ширину карточки, а не висит
  // слева узкой полосой; на телефоне avail=0 и размеры прежние (days*34).
  const wrapRef = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAvail(window.innerWidth >= 1024 ? el.clientWidth : 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // График открывается на последних днях: сегодняшние продажи справа, а не за горизонтальной прокруткой.
  const dayCount = byDay.length
  useEffect(() => {
    const el = wrapRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [dayCount, avail])
  if (byDay.length === 0) return null

  // Left gutter for the revenue axis labels, bottom gutter for date labels
  // (added per founder feedback 2026-08-22: the old chart had no axis at
  // all, just two floating min/max numbers -- unreadable for any day that
  // wasn't the single highest or lowest).
  const padLeft = 54
  const chartWidth = Math.max(byDay.length * 34, 320, avail - padLeft)
  const width = chartWidth + padLeft
  const height = 200
  const padTop = 24
  const padBottom = 34
  const plotHeight = height - padTop - padBottom
  const slot = chartWidth / byDay.length
  const barWidth = avail > 0 ? Math.min(slot * 0.6, 56) : slot * 0.6
  const gap = slot - barWidth

  const maxRevenue = Math.max(...byDay.map(d => d.revenue), 1)
  const maxOrders = Math.max(...byDay.map(d => d.orderCount), 1)
  const pricePerUnit = byDay.map(d => (d.unitsSold > 0 ? d.revenue / d.unitsSold : 0))
  const maxPricePerUnit = Math.max(...pricePerUnit, 1)

  const maxDay = byDay.reduce((a, b) => (b.revenue > a.revenue ? b : a), byDay[0])
  const minDay = byDay.reduce((a, b) => (b.revenue < a.revenue ? b : a), byDay[0])

  // Sparse date ticks -- one label roughly every 1/8th of the period so a
  // 90-day view stays readable instead of jamming in 90 overlapping dates.
  const tickEvery = Math.max(1, Math.ceil(byDay.length / 8))
  const dateTickIndices = byDay.map((_, i) => i).filter(i => i % tickEvery === 0 || i === byDay.length - 1)
  // Дата уже по Алматы (YYYY-MM-DD): разбираем строку, а не Date, чтобы пояс браузера
  // не сдвигал день.
  const formatTick = (isoDate: string) => `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`
  const revenueGridSteps = [0, 0.25, 0.5, 0.75, 1]

  const x = (i: number) => padLeft + i * (barWidth + gap) + gap / 2
  const barCenter = (i: number) => x(i) + barWidth / 2
  const yOrders = (i: number) => padTop + plotHeight - (byDay[i].orderCount / maxOrders) * plotHeight
  const yPrice = (i: number) => padTop + plotHeight - (pricePerUnit[i] / maxPricePerUnit) * plotHeight

  const ordersPath = byDay.map((_, i) => `${i === 0 ? 'M' : 'L'} ${barCenter(i)} ${yOrders(i)}`).join(' ')
  const pricePath = byDay.map((_, i) => `${i === 0 ? 'M' : 'L'} ${barCenter(i)} ${yPrice(i)}`).join(' ')

  // Alternating background bands per calendar month, so a period spanning
  // several months reads at a glance instead of requiring every date label.
  const monthBands: { startI: number; endI: number; month: string }[] = []
  byDay.forEach((d, i) => {
    const month = d.date.slice(0, 7)
    const last = monthBands[monthBands.length - 1]
    if (last && last.month === month) last.endI = i
    else monthBands.push({ startI: i, endI: i, month })
  })

  return (
    <div ref={wrapRef} className="overflow-x-auto">
      <svg width={width} height={height} className="block">
        {monthBands.map((b, i) => (
          <rect key={b.month} x={x(b.startI) - gap / 2} y={padTop} width={(b.endI - b.startI + 1) * (barWidth + gap)} height={plotHeight}
            fill="var(--nav-bg)" opacity={i % 2 === 0 ? 1 : 0} />
        ))}

        {/* Revenue axis -- gridlines + ₸ labels, replacing the old "just two
            floating numbers for the single highest/lowest day" approach. */}
        {revenueGridSteps.map(step => {
          const y = padTop + plotHeight - step * plotHeight
          return (
            <g key={step}>
              <line x1={padLeft} y1={y} x2={width} y2={y} stroke="var(--nav-border-soft)" strokeWidth={1} />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" fontSize={9} fill="var(--nav-text-muted)">
                {Math.round(step * maxRevenue).toLocaleString('ru-KZ')}
              </text>
            </g>
          )
        })}

        {/* Date axis -- sparse ticks so a 90-day view stays legible. */}
        {dateTickIndices.map(i => (
          <text key={byDay[i].date} x={barCenter(i)} y={padTop + plotHeight + 16}
            textAnchor="middle" fontSize={9} fill="var(--nav-text-muted)">
            {formatTick(byDay[i].date)}
          </text>
        ))}

        {byDay.map((d, i) => {
          const barHeight = (d.revenue / maxRevenue) * plotHeight
          return (
            <rect key={d.date} x={x(i)} y={padTop + plotHeight - barHeight} width={barWidth} height={barHeight}
              rx={3} fill="var(--nav-accent)" opacity={0.85}>
              <title>{`${d.date}\nВыручка: ${d.revenue.toLocaleString('ru-KZ')} ₸\nЗаказов: ${d.orderCount}\nШтук: ${d.unitsSold}${d.unitsSold > 0 ? `\nЦена/шт: ${Math.round(d.revenue / d.unitsSold).toLocaleString('ru-KZ')} ₸` : ''}`}</title>
            </rect>
          )
        })}

        <path d={ordersPath} fill="none" stroke="var(--nav-success)" strokeWidth={2} />
        <path d={pricePath} fill="none" stroke="var(--nav-magenta)" strokeWidth={2.5} strokeDasharray="6 4" />

        {/* Min/max revenue labels directly on the chart, not tucked into a tooltip */}
        <text x={barCenter(byDay.indexOf(maxDay))} y={padTop + plotHeight - (maxDay.revenue / maxRevenue) * plotHeight - 6}
          textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--nav-text-primary)">
          {maxDay.revenue.toLocaleString('ru-KZ')}
        </text>
        <text x={barCenter(byDay.indexOf(minDay))} y={padTop + plotHeight - (minDay.revenue / maxRevenue) * plotHeight - 6}
          textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--nav-text-muted)">
          {minDay.revenue.toLocaleString('ru-KZ')}
        </text>
      </svg>
      <div className="flex items-center flex-wrap gap-4 mt-2 text-[11px] px-1" style={{ color: 'var(--nav-text-muted)' }}>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'var(--nav-accent)' }} />Выручка по дням</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 inline-block" style={{ background: 'var(--nav-success)' }} />Заказов (тренд)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 inline-block" style={{ borderTop: '2px dashed var(--nav-magenta)' }} />Цена за штуку (тренд)</span>
      </div>
    </div>
  )
}

export default function KaspiShopFinance() {
  // Заголовок вкладки и на время загрузки (PageHeader ещё не отрисован); строка та же, что ставит PageHeader.
  usePageDocumentTitle('Финансы')
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>({ kind: 'days', days: 30 })
  const [customDaysOpen, setCustomDaysOpen] = useState(false)
  const [customSinceDate, setCustomSinceDate] = useState('')
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [accessError, setAccessError] = useState('')
  // Номер последнего запроса сводки: ответ на устаревший (другой период) не затирает новый.
  const summaryReqId = useRef(0)

  useEffect(() => { checkAccess() }, [])
  const periodKey = periodQuery(period)
  useEffect(() => { if (!loading) loadSummary(period) }, [periodKey, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function checkAccess() {
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
    setLoading(false)
  }

  async function loadSummary(forPeriod: Period) {
    const id = ++summaryReqId.current
    setSummaryLoading(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/finance?${periodQuery(forPeriod)}`, { headers })
      const data = await res.json()
      if (id !== summaryReqId.current) return
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить финансы'); setSummary(null); return }
      setSummary(data)
    } catch {
      if (id !== summaryReqId.current) return
      setLoadError('Не удалось загрузить финансы. Проверьте соединение и попробуйте ещё раз.')
      setSummary(null)
    } finally {
      if (id === summaryReqId.current) setSummaryLoading(false)
    }
  }

  if (loading) {
    return accessError
      ? <KaspiAccessRetry message={accessError} onRetry={() => { setAccessError(''); checkAccess() }} />
      : <LoadingSpinner />
  }

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />

      <PageContainer variant="full" className="flex-1 min-w-0 pb-6">
        <PageHeader title="Финансы" subtitle="Выручка" />
        {summary?.sessionExpired && <SessionExpiredBanner />}

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => loadSummary(period)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {/* Kaspi не ответил на заказы: цифры ниже неполные или неизвестны, и 0 ₸ тут
            не значит «не продавали» (аудит K35). */}
        {summary?.upstreamFailed && !summary.sessionExpired && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>
              Kaspi не ответил на часть запросов к заказам, поэтому {summary.orderCount > 0 ? 'цифры ниже неполные' : 'цифры неизвестны'}. Не считайте их итогом, попробуйте ещё раз через минуту.
            </span>
            <button onClick={() => loadSummary(period)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div className="text-xs min-w-0" style={{ color: 'var(--nav-text-muted)' }}>
              {summary?.periodFrom ? `с ${ruDate(summary.periodFrom)} по сегодня, время Алматы` : 'Время Алматы'}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              <div className="flex items-center gap-1 nav-glass rounded-full p-1">
                {PERIODS.map(p => {
                  const active = !customDaysOpen && period.kind === 'days' && period.days === p
                  return (
                    <button key={p} onClick={() => { setCustomDaysOpen(false); setPeriod({ kind: 'days', days: p }) }}
                      className="relative text-xs font-medium rounded-full px-3 py-1.5 transition-colors"
                      style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                      {active && (
                        <motion.span layoutId="financePeriodPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)', zIndex: 0 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                      )}
                      <span className="relative" style={{ zIndex: 1 }}>{p} дн.</span>
                    </button>
                  )
                })}
                {/* Custom period (founder request 2026-08-22, refined to a
                    calendar date rather than a raw day count after founder
                    feedback -- "лучше выбрать дату с какого периода
                    считать"): на сервер уходит сама дата since=YYYY-MM-DD, граница
                    считается там как 00:00 по Алматы (аудит K37). */}
                <button onClick={() => {
                  const today = almatyDateOf(Date.now())
                  const from = period.kind === 'since' ? period.since : shiftAlmatyDate(today, -(period.days - 1))
                  setCustomSinceDate(from)
                  setCustomDaysOpen(true)
                }}
                  className="relative text-xs font-medium rounded-full px-3 py-1.5 transition-colors"
                  style={{ color: customDaysOpen ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)', background: customDaysOpen ? 'var(--nav-accent)' : 'transparent' }}>
                  {customDaysOpen && period.kind === 'since' ? `с ${ruDate(period.since)}` : 'Свой период'}
                </button>
              </div>
              {customDaysOpen && (
                <form className="flex items-center gap-1.5" onSubmit={e => {
                  e.preventDefault()
                  if (!customSinceDate) return
                  setPeriod({ kind: 'since', since: customSinceDate })
                }}>
                  <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>с</span>
                  <input type="date" value={customSinceDate} onChange={e => setCustomSinceDate(e.target.value)}
                    max={almatyDateOf(Date.now())}
                    min={shiftAlmatyDate(almatyDateOf(Date.now()), -(MAX_PERIOD_DAYS - 1))}
                    autoFocus
                    className="text-xs rounded-full px-3 py-1.5 outline-none"
                    style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border-soft)' }} />
                  <button type="submit" className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    Применить
                  </button>
                </form>
              )}
            </div>
          </div>
          {(() => {
            // «—» вместо нулей, когда Kaspi не ответил или сессия мертва: 0 ₸ это ложь.
            const unknown = !summary || summary.sessionExpired || (summary.upstreamFailed && summary.orderCount === 0)
            const dash = <span style={{ color: 'var(--nav-text-muted)' }}>—</span>
            // Телефон: выручка на всю ширину (7 и больше знаков не помещаются в треть
            // карточки на 390 px и налезали на соседей), заказы и средний чек в два столбца (K39).
            const numCls = 'font-black font-mono tabular-nums leading-tight min-w-0 [overflow-wrap:anywhere]'
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-4 lg:gap-6">
                <div className="col-span-2 sm:col-span-1 min-w-0">
                  <div className={`text-3xl lg:text-4xl ${numCls}`} style={{ color: 'var(--nav-text-primary)' }}>{unknown ? dash : summary!.totalRevenue.toLocaleString('ru-KZ')}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ выручка</div>
                </div>
                <div className="min-w-0">
                  <div className={`text-2xl sm:text-3xl lg:text-4xl ${numCls}`} style={{ color: 'var(--nav-text-primary)' }}>{unknown ? dash : summary!.orderCount}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>заказов</div>
                </div>
                <div className="min-w-0">
                  <div className={`text-2xl sm:text-3xl lg:text-4xl ${numCls}`} style={{ color: 'var(--nav-text-primary)' }}>{unknown ? dash : Math.round(summary!.averageOrderValue).toLocaleString('ru-KZ')}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ средний чек</div>
                </div>
              </div>
            )
          })()}
          {summary?.truncated && (
            <div className="text-[11px] mt-4" style={{ color: 'var(--nav-text-muted)' }}>
              {summary.newestFirst
                ? `Период длиннее, чем мы успеваем загрузить: учтены самые свежие заказы (до 200 на статус, получено ${summary.fetchedOrders ?? 200}). Более ранние заказы периода в сумму не вошли.`
                : `Kaspi отдаёт заказы не от новых к старым, а мы загружаем не больше 200 на статус, поэтому учтена только часть заказов периода. Суммы занижены.`}
            </div>
          )}
        </motion.div>

        {summaryLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Считаем...</div>
        ) : !summary || summary.byDay.length === 0 ? (
          // «Заказов нет» только когда Kaspi ответил на все запросы: при сбое или мёртвой
          // сессии это не правда, и баннер сверху уже объясняет причину.
          loadError || summary?.upstreamFailed || summary?.sessionExpired ? null : (
            <div className="nav-glass rounded-2xl p-8 text-center">
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>За этот период выполненных заказов нет.</div>
            </div>
          )
        ) : (
          <>
            {/* xl+: график слева (2/3), список по дням справа (1/3); уже xl -- друг под другом */}
            <div className="grid grid-cols-1 gap-4 mb-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
            <div className="nav-glass rounded-2xl p-4 min-w-0">
              <FinanceChart byDay={summary.byDay} />
            </div>

            <div className="nav-glass rounded-2xl max-h-64 overflow-y-auto xl:max-h-[22rem]">
              {[...summary.byDay].reverse().map((d, i) => (
                <div key={d.date} className="flex items-center justify-between px-4 py-3" style={i > 0 ? { borderTop: '1px solid var(--nav-border-soft)' } : undefined}>
                  <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{d.date}</span>
                  <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{d.orderCount} {d.orderCount === 1 ? 'заказ' : 'заказов'}</span>
                  <span className="font-mono font-semibold text-sm tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{d.revenue.toLocaleString('ru-KZ')} ₸</span>
                </div>
              ))}
            </div>
            </div>

            <div className="text-sm font-semibold mb-2 px-1" style={{ color: 'var(--nav-text-primary)' }}>Поведение покупателей</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              <div className="nav-glass rounded-2xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nav-text-muted)' }}>Дни недели</div>
                {(() => {
                  const maxW = Math.max(...summary.behavioral.byWeekday.map(w => w.orderCount), 1)
                  const order = [1, 2, 3, 4, 5, 6, 0] // Пн..Вс
                  return (
                    <div className="space-y-1.5">
                      {order.map(day => {
                        const w = summary.behavioral.byWeekday.find(x => x.day === day)!
                        return (
                          <div key={day} className="flex items-center gap-2">
                            <span className="text-[11px] w-5 flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>{w.label}</span>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--nav-accent-track)' }}>
                              <div className="h-full rounded-full" style={{ width: `${(w.orderCount / maxW) * 100}%`, background: 'var(--nav-accent)' }} />
                            </div>
                            <span className="text-[11px] w-5 text-right flex-shrink-0 tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{w.orderCount}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              <div className="nav-glass rounded-2xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nav-text-muted)' }}>Часы (по времени Казахстана)</div>
                {(() => {
                  const topHours = [...summary.behavioral.byHour].sort((a, b) => b.orderCount - a.orderCount).slice(0, 3).filter(h => h.orderCount > 0)
                  if (topHours.length === 0) return <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>Недостаточно данных.</div>
                  return (
                    <div className="space-y-1.5">
                      {topHours.map(h => (
                        <div key={h.hour} className="flex items-center justify-between">
                          <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{h.hour}:00–{h.hour + 1}:00</span>
                          <span className="text-xs tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{h.orderCount} {h.orderCount === 1 ? 'заказ' : 'заказов'}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              <div className="nav-glass rounded-2xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nav-text-muted)' }}>Зарплатный цикл</div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>До 10 числа</span>
                  <span className="font-mono font-semibold text-sm tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{summary.behavioral.beforePayday.revenue.toLocaleString('ru-KZ')} ₸</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>После 10 числа</span>
                  <span className="font-mono font-semibold text-sm tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{summary.behavioral.afterPayday.revenue.toLocaleString('ru-KZ')} ₸</span>
                </div>
              </div>

              <div className="nav-glass rounded-2xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--nav-text-muted)' }}>Пол покупателей</div>
                <div className="text-[10px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>оценочно по имени, не данные Kaspi</div>
                {(() => {
                  const g = summary.behavioral.genderEstimate
                  const total = g.male + g.female + g.unknown || 1
                  return (
                    <>
                      <div className="h-2.5 rounded-full overflow-hidden flex mb-2" style={{ background: 'var(--nav-border-soft)' }}>
                        <div className="h-full" style={{ width: `${(g.female / total) * 100}%`, background: 'var(--nav-accent)' }} />
                        <div className="h-full" style={{ width: `${(g.male / total) * 100}%`, background: 'var(--nav-teal)' }} />
                        <div className="h-full" style={{ width: `${(g.unknown / total) * 100}%`, background: 'var(--nav-text-muted)' }} />
                      </div>
                      <div className="flex items-center flex-wrap gap-3 text-[11px]" style={{ color: 'var(--nav-text-secondary)' }}>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--nav-accent)' }} />Ж {g.female}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--nav-teal)' }} />М {g.male}</span>
                        {g.unknown > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--nav-text-muted)' }} />? {g.unknown}</span>}
                      </div>
                    </>
                  )
                })()}
              </div>

              {summary.behavioral.holidayOrders.length > 0 && (
                <div className="nav-glass rounded-2xl p-4 sm:col-span-2 lg:col-span-1">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nav-text-muted)' }}>В праздники</div>
                  <div className="space-y-1.5">
                    {summary.behavioral.holidayOrders.map(h => (
                      <div key={h.date} className="flex items-center justify-between">
                        <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{h.label}</span>
                        <span className="text-xs tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{h.orderCount} · {h.revenue.toLocaleString('ru-KZ')} ₸</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ABC-анализ + разрезы по атрибутам (founder request 2026-08-21).
                Цвет/размер извлекаются из НАЗВАНИЙ товаров -- Kaspi не отдаёт
                характеристики в данных заказов, и подпись говорит об этом
                честно. */}
            {(summary.abc || []).length > 0 && (
              <div className="mt-6 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:gap-6 xl:items-start">
                <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap px-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>ABC-анализ по товарам</div>
                  <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>A — первые 80% выручки, B — следующие 15%, C — остальное</div>
                </div>
                <div className="nav-glass rounded-2xl overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 560 }}>
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--nav-text-muted)' }}>
                        <th className="text-left font-semibold px-4 py-2.5">Класс</th>
                        <th className="text-left font-semibold px-2 py-2.5">Товар</th>
                        <th className="text-right font-semibold px-2 py-2.5">Выручка</th>
                        <th className="text-right font-semibold px-2 py-2.5">Шт</th>
                        <th className="text-right font-semibold px-2 py-2.5">Доля</th>
                        <th className="text-right font-semibold px-4 py-2.5">Накопл.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.abc.map(row => (
                        <tr key={row.code} style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                          <td className="px-4 py-2.5">
                            <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: ABC_COLORS[row.abcClass], color: '#fff' }}>{row.abcClass}</span>
                          </td>
                          <td className="px-2 py-2.5" style={{ color: 'var(--nav-text-primary)' }}>{row.name}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: 'var(--nav-text-primary)' }}>{row.revenue.toLocaleString('ru-KZ')} ₸</td>
                          <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{row.unitsSold}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{(row.share * 100).toFixed(1)}%</td>
                          <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{(row.cumulativeShare * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>

                <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 mt-6 xl:mt-0 mb-3 flex-wrap px-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Продажи по атрибутам</div>
                  <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>цвет и размер определены по названию товара — характеристики Kaspi не передаёт</div>
                </div>
                <div className="grid sm:grid-cols-2 xl:grid-cols-1 gap-4">
                  <AttributeSliceCard title="По цвету" slices={summary.byColor || []} />
                  <AttributeSliceCard title="По размеру" slices={summary.bySize || []} />
                </div>
                </div>
              </div>
            )}
          </>
        )}
      </PageContainer>
    </main>
    </DesktopShell>
  )
}
