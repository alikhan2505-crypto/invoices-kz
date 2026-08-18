'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { formatDateTime } from '@/lib/date'
import Skeleton from '@/components/Skeleton'

// Flat solid-fill status badges (design spec: status chips are a solid
// color + white text, not a soft translucent tint) -- history/page.tsx
// still uses the old soft-tint style; this page uses the approved one.
const statusFill: Record<string, string> = {
  paid: 'var(--nav-success)',
  sent: 'var(--nav-accent)',
  viewed: 'var(--nav-teal)',
  overdue: 'var(--nav-critical)',
  draft: 'var(--nav-text-muted)',
  cancelled: 'var(--nav-text-muted)',
}
const statusText: Record<string, string> = {
  paid: 'Оплачен',
  sent: 'Отправлен',
  overdue: 'Просрочен',
  draft: 'Черновик',
  viewed: 'Просмотрен',
  cancelled: 'Аннулирован',
}

const MONTH_ABBR_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nav-text-muted)' }}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12h6M9 15.5h6M9 8.5h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// Animates an integer up from 0 to `value` on mount (i.e. when this
// component instance first appears -- callers mount it only once the real
// value is known, so it isn't wasted animating 0 -> 0 while loading).
// Instantly snaps to the final value under prefers-reduced-motion.
function CountUp({ value, reduceMotion, format }: { value: number; reduceMotion: boolean; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(reduceMotion ? value : 0)

  useEffect(() => {
    if (reduceMotion) { setDisplay(value); return }
    let raf = 0
    const duration = 900
    const start = performance.now()
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(value * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // Deliberately runs once per mount (fresh component instance per stat card)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{format ? format(display) : display.toLocaleString('ru-KZ')}</>
}

export default function DashboardPage() {
  const router = useRouter()
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase
      .from('invoices')
      .select('*, clients(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  const now = new Date()
  const monthInvoices = useMemo(
    () => invoices.filter(inv => {
      const d = new Date(inv.created_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices]
  )

  const stats = useMemo(() => ({
    created: monthInvoices.length,
    paid: monthInvoices.filter(i => i.status === 'paid').length,
    income: monthInvoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.amount), 0),
    overdue: monthInvoices.filter(i => i.status === 'overdue').length,
  }), [monthInvoices])

  // Paid revenue per day for the last 30 days (today inclusive), keyed off
  // created_at same as the rest of this query -- the invoices table has no
  // separate paid_at column to fetch instead.
  const dailyRevenue = useMemo(() => {
    const days: { date: Date; total: number }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      days.push({ date: d, total: 0 })
    }
    const indexByDay = new Map(days.map((d, i) => [d.date.toDateString(), i]))
    invoices.forEach(inv => {
      if (inv.status !== 'paid') return
      const d = new Date(inv.created_at)
      d.setHours(0, 0, 0, 0)
      const idx = indexByDay.get(d.toDateString())
      if (idx !== undefined) days[idx].total += Number(inv.amount)
    })
    return days
  }, [invoices])

  const recentInvoices = invoices.slice(0, 5)
  const hasAnyInvoices = invoices.length > 0

  const statCards = [
    { label: 'Счетов создано', value: stats.created },
    { label: 'Оплачено', value: stats.paid },
    { label: 'Доход ₸', value: stats.income, isMoney: true },
    { label: 'Просрочено', value: stats.overdue },
  ]

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-5xl mx-auto p-4">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Главная</h2>
            <button
              onClick={() => router.push('/create')}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
            >
              <PlusIcon />
              Создать счёт
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {statCards.map(card => (
              <div key={card.label} className="nav-glass rounded-2xl p-4" style={{ boxShadow: 'var(--nav-card-glow)' }}>
                <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : card.isMoney ? (
                    <CountUp value={card.value} reduceMotion={reduceMotion} format={n => n.toLocaleString('ru-KZ')} />
                  ) : (
                    <CountUp value={card.value} reduceMotion={reduceMotion} />
                  )}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* 30-day revenue chart */}
          <div className="nav-glass rounded-2xl p-4 mb-4" style={{ boxShadow: 'var(--nav-card-glow)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--nav-text-primary)' }}>Доход за 30 дней</h3>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <RevenueChart days={dailyRevenue} reduceMotion={reduceMotion} />
            )}
          </div>

          {/* Recent invoices */}
          <div className="nav-glass rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--nav-card-glow)' }}>
            <div className="flex items-center justify-between px-4 pt-4 pb-1">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Последние счета</h3>
              <button onClick={() => router.push('/history')} className="text-xs font-medium" style={{ color: 'var(--nav-accent)' }}>
                Вся история →
              </button>
            </div>

            {loading ? (
              <div className="p-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center justify-between p-3">
                    <div>
                      <Skeleton className="h-3 w-14 mb-2" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : !hasAnyInvoices ? (
              <div className="flex flex-col items-center text-center px-4 py-10">
                <DocumentIcon />
                <p className="text-sm mt-3 mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
                  У вас пока нет счетов. Создайте первый, чтобы начать.
                </p>
                <button
                  onClick={() => router.push('/create')}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
                >
                  Создать первый счёт
                </button>
              </div>
            ) : (
              <div>
                {recentInvoices.map((inv, i) => (
                  <div
                    key={inv.id}
                    onClick={() => router.push('/invoice/' + inv.id)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer transition-colors duration-150"
                    style={{
                      borderBottom: i < recentInvoices.length - 1 ? '1px solid var(--nav-border-soft)' : 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-surface-glass)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="min-w-0">
                      <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{inv.number}</div>
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--nav-text-primary)' }}>
                        {inv.client_name || inv.clients?.name || 'Без клиента'}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{formatDateTime(inv.created_at)}</div>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <div className="text-sm font-medium tabular-nums mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
                        {Number(inv.amount).toLocaleString('ru-KZ')} ₸
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded-full font-semibold text-white"
                        style={{ background: statusFill[inv.status] || statusFill.draft }}
                      >
                        {statusText[inv.status] || statusText.draft}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </DesktopShell>
  )
}

function RevenueChart({ days, reduceMotion }: { days: { date: Date; total: number }[]; reduceMotion: boolean }) {
  const maxValue = Math.max(...days.map(d => d.total))
  const linePathRef = useRef<SVGPathElement>(null)
  const [pathLen, setPathLen] = useState(0)
  const [drawn, setDrawn] = useState(false)

  const VIEW_W = 720
  const VIEW_H = 220
  const PAD_LEFT = 50
  const PAD_RIGHT = 8
  const PAD_TOP = 14
  const PAD_BOTTOM = 26
  const chartW = VIEW_W - PAD_LEFT - PAD_RIGHT
  const chartH = VIEW_H - PAD_TOP - PAD_BOTTOM
  const bottomY = PAD_TOP + chartH

  const x = (i: number) => PAD_LEFT + (i / (days.length - 1)) * chartW
  const y = (v: number) => (maxValue > 0 ? PAD_TOP + chartH - (v / maxValue) * chartH : bottomY)

  const linePathD = days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)},${y(d.total).toFixed(2)}`).join(' ')
  const areaPathD = `${linePathD} L ${x(days.length - 1).toFixed(2)},${bottomY} L ${x(0).toFixed(2)},${bottomY} Z`

  useEffect(() => {
    if (!linePathRef.current || reduceMotion) return
    const len = linePathRef.current.getTotalLength()
    setPathLen(len)
    setDrawn(false)
    const raf = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(raf)
  }, [linePathD, reduceMotion])

  if (maxValue === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-center px-6 text-sm" style={{ color: 'var(--nav-text-muted)' }}>
        Пока нет оплаченных счетов за последние 30 дней
      </div>
    )
  }

  const gridFractions = [0, 1 / 3, 2 / 3, 1]
  const tickIndices = [0, 7, 14, 21, days.length - 1]

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height="220" preserveAspectRatio="none" style={{ minWidth: '480px', display: 'block' }}>
        <defs>
          <linearGradient id="dashboardRevenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--nav-accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--nav-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines + y-axis labels */}
        {gridFractions.map(f => {
          const gy = PAD_TOP + chartH - f * chartH
          return (
            <g key={f}>
              <line x1={PAD_LEFT} y1={gy} x2={VIEW_W - PAD_RIGHT} y2={gy} stroke="currentColor" strokeWidth="1" style={{ color: 'var(--nav-text-muted)', opacity: 0.15 }} />
              <text x={PAD_LEFT - 8} y={gy + 3} textAnchor="end" fontSize="9" fill="var(--nav-text-muted)">
                {Math.round(f * maxValue).toLocaleString('ru-KZ')}
              </text>
            </g>
          )
        })}

        {/* Area fill */}
        <path d={areaPathD} fill="url(#dashboardRevenueGradient)" stroke="none" />

        {/* Line */}
        <path
          ref={linePathRef}
          d={linePathD}
          fill="none"
          stroke="var(--nav-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={reduceMotion ? undefined : {
            strokeDasharray: pathLen,
            strokeDashoffset: drawn ? 0 : pathLen,
            transition: 'stroke-dashoffset 1s ease-out',
          }}
        />

        {/* Last point marker */}
        <circle cx={x(days.length - 1)} cy={y(days[days.length - 1].total)} r="3.5" fill="var(--nav-accent)" />

        {/* X-axis tick labels */}
        {tickIndices.map(i => (
          <text key={i} x={x(i)} y={VIEW_H - 6} textAnchor="middle" fontSize="9" fill="var(--nav-text-muted)">
            {`${days[i].date.getDate()} ${MONTH_ABBR_RU[days[i].date.getMonth()]}`}
          </text>
        ))}
      </svg>
    </div>
  )
}
