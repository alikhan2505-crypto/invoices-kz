'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'

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
  if (byDay.length === 0) return null

  // Left gutter for the revenue axis labels, bottom gutter for date labels
  // (added per founder feedback 2026-08-22: the old chart had no axis at
  // all, just two floating min/max numbers -- unreadable for any day that
  // wasn't the single highest or lowest).
  const padLeft = 54
  const chartWidth = Math.max(byDay.length * 34, 320)
  const width = chartWidth + padLeft
  const height = 200
  const padTop = 24
  const padBottom = 34
  const plotHeight = height - padTop - padBottom
  const barWidth = (chartWidth / byDay.length) * 0.6
  const gap = (chartWidth / byDay.length) * 0.4

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
  const formatTick = (isoDate: string) => {
    const d = new Date(isoDate)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
  }
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
    <div className="overflow-x-auto">
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
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [customDaysOpen, setCustomDaysOpen] = useState(false)
  const [customSinceDate, setCustomSinceDate] = useState('')
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
              <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Финансы</div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Выручка</h1>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              <div className="flex items-center gap-1 nav-glass rounded-full p-1">
                {PERIODS.map(p => {
                  const active = !customDaysOpen && days === p
                  return (
                    <button key={p} onClick={() => { setCustomDaysOpen(false); setDays(p) }}
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
                    считать"): pick a start date, days is computed from it.
                    Backend still accepts any 1-365 day count. */}
                <button onClick={() => {
                  const d = new Date()
                  d.setDate(d.getDate() - days)
                  setCustomSinceDate(d.toISOString().slice(0, 10))
                  setCustomDaysOpen(true)
                }}
                  className="relative text-xs font-medium rounded-full px-3 py-1.5 transition-colors"
                  style={{ color: customDaysOpen ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)', background: customDaysOpen ? 'var(--nav-accent)' : 'transparent' }}>
                  {customDaysOpen ? `${days} дн.` : 'Свой период'}
                </button>
              </div>
              {customDaysOpen && (
                <form className="flex items-center gap-1.5" onSubmit={e => {
                  e.preventDefault()
                  if (!customSinceDate) return
                  const since = new Date(customSinceDate + 'T00:00:00')
                  const n = Math.round((Date.now() - since.getTime()) / 86400000)
                  if (Number.isFinite(n) && n >= 1 && n <= 365) setDays(n)
                }}>
                  <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>с</span>
                  <input type="date" value={customSinceDate} onChange={e => setCustomSinceDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    min={new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)}
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
          <div className="grid grid-cols-3 gap-3 lg:gap-6">
            <div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{(summary?.totalRevenue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ выручка</div>
            </div>
            <div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{summary?.orderCount ?? 0}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>заказов</div>
            </div>
            <div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{Math.round(summary?.averageOrderValue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>₸ средний чек</div>
            </div>
          </div>
          {summary?.truncated && (
            <div className="text-[11px] mt-4" style={{ color: 'var(--nav-text-muted)' }}>Учтены последние 200 заказов на статус — на большом объёме сумма может быть неполной.</div>
          )}
        </motion.div>

        {summaryLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Считаем...</div>
        ) : !summary || summary.byDay.length === 0 ? (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>За этот период выполненных заказов нет.</div>
          </div>
        ) : (
          <>
            <div className="nav-glass rounded-2xl p-4 mb-4">
              <FinanceChart byDay={summary.byDay} />
            </div>

            <div className="nav-glass rounded-2xl mb-4 max-h-64 overflow-y-auto">
              {[...summary.byDay].reverse().map((d, i) => (
                <div key={d.date} className="flex items-center justify-between px-4 py-3" style={i > 0 ? { borderTop: '1px solid var(--nav-border-soft)' } : undefined}>
                  <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{d.date}</span>
                  <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{d.orderCount} {d.orderCount === 1 ? 'заказ' : 'заказов'}</span>
                  <span className="font-mono font-semibold text-sm tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{d.revenue.toLocaleString('ru-KZ')} ₸</span>
                </div>
              ))}
            </div>

            <div className="text-sm font-semibold mb-2 px-1" style={{ color: 'var(--nav-text-primary)' }}>Поведение покупателей</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              <div className="mt-6">
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
                        <th className="text-right font-semibold px-2 py-2.5">Шт</th>
                        <th className="text-right font-semibold px-2 py-2.5">Выручка</th>
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
                          <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{row.unitsSold}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{row.revenue.toLocaleString('ru-KZ')} ₸</td>
                          <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{(row.share * 100).toFixed(1)}%</td>
                          <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{(row.cumulativeShare * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-baseline justify-between gap-3 mt-6 mb-3 flex-wrap px-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Продажи по атрибутам</div>
                  <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>цвет и размер определены по названию товара — характеристики Kaspi не передаёт</div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <AttributeSliceCard title="По цвету" slices={summary.byColor || []} />
                  <AttributeSliceCard title="По размеру" slices={summary.bySize || []} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
