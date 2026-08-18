'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { formatDateTime } from '@/lib/date'
import Skeleton from '@/components/Skeleton'

// Same easing curve used on the landing page (src/app/page.tsx) -- kept
// identical across the app rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

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

// Copy reused verbatim from SiteNav's lockedMessages.ru so the "coming
// soon" language matches what non-admins already see in the nav dropdowns.
const LOCKED_TEXT = 'Скоро откроем всем'

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

function InvoiceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M14 2v6h6" />
      <path d="M8.5 13h7M8.5 17h4.5" />
    </svg>
  )
}

function ShopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9l1.2-5h13.6L20 9" />
      <path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M5 9v11h14V9" />
    </svg>
  )
}

function AgentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v12H8l-4 4V4z" />
      <path d="M12 8.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nav-text-muted)', flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

// Hand-rolled sparkline: draws in via framer-motion's `pathLength` (works on
// any SVG geometry element, polylines included), no chart library involved.
function Sparkline({
  values, width = 100, height = 28, colorVar, strokeOpacity = 1, delay = 0, reduceMotion,
}: {
  values: number[]; width?: number; height?: number; colorVar: string; strokeOpacity?: number; delay?: number; reduceMotion: boolean
}) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)
  const stepX = values.length > 1 ? width / (values.length - 1) : 0
  const points = values
    .map((v, i) => {
      const px = i * stepX
      const py = height - 3 - ((v - min) / range) * (height - 6)
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      <motion.polyline
        points={points}
        fill="none"
        stroke={`var(${colorVar})`}
        strokeOpacity={strokeOpacity}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.8, ease: EASE, delay: reduceMotion ? 0 : delay }}
      />
    </svg>
  )
}

// % change vs. the previous period. Returns null (never a fabricated
// number) when there's nothing to compare against -- callers hide the
// delta entirely in that case.
function computeDelta(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

type ProductState = 'data' | 'locked' | 'neutral'

function ProductCard({
  index, reduceMotion, icon, colorVar, softVar, title, state,
  subtitle, deltaPct, deltaLabel, sparkValues, neutralText, onClick,
}: {
  index: number
  reduceMotion: boolean
  icon: React.ReactNode
  colorVar: string
  softVar: string
  title: string
  state: ProductState
  subtitle?: string
  deltaPct?: number | null
  deltaLabel?: string
  sparkValues?: number[]
  neutralText?: string
  onClick?: () => void
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : index * 0.05 }}
      onClick={onClick}
      className={`nav-glass nav-card-accent rounded-[22px] p-[18px] ${CARD_HOVER}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, var(${softVar}), transparent)`, color: `var(${colorVar})` }}
        >
          {icon}
        </span>
        {state === 'locked' && <LockIcon />}
      </div>
      <div className="text-sm font-semibold mt-3" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>
        {title}
      </div>

      {state === 'data' && (
        <>
          <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{subtitle}</div>
          <div className="text-xs font-bold mt-2.5" style={{ color: 'var(--nav-success)', minHeight: '15px' }}>
            {deltaPct !== null && deltaPct !== undefined ? `${deltaPct >= 0 ? '+' : ''}${deltaPct}% ${deltaLabel || ''}` : ' '}
          </div>
          {sparkValues && sparkValues.length > 1 && (
            <Sparkline
              values={sparkValues}
              height={26}
              colorVar="--nav-text-muted"
              strokeOpacity={0.35}
              reduceMotion={reduceMotion}
              delay={reduceMotion ? 0 : 0.3 + index * 0.08}
            />
          )}
        </>
      )}

      {state === 'locked' && (
        <div className="text-[11.5px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>{LOCKED_TEXT}</div>
      )}
      {state === 'neutral' && (
        <div className="text-[11.5px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>{neutralText}</div>
      )}
    </motion.div>
  )
}

function MiniCard({
  index, reduceMotion, dotVar, label, state,
  value, deltaPct, sparkValues, sparkColorVar, neutralText, onClick,
}: {
  index: number
  reduceMotion: boolean
  dotVar: string
  label: string
  state: ProductState
  value?: string
  deltaPct?: number | null
  sparkValues?: number[]
  sparkColorVar?: string
  neutralText?: string
  onClick?: () => void
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.15 + index * 0.05 }}
      onClick={onClick}
      className={`nav-glass rounded-[18px] p-[15px_17px] flex flex-col justify-between flex-1 ${CARD_HOVER}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div>
        <div className="text-[11.5px] font-bold flex items-center gap-[7px]" style={{ color: 'var(--nav-text-secondary)' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `var(${dotVar})` }} />
          {label}
          {state === 'locked' && <LockIcon />}
        </div>
        {state === 'data' ? (
          <div className="text-xl font-bold mt-1.5 flex items-baseline gap-2" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.03em' }}>
            {value}
            {deltaPct !== null && deltaPct !== undefined && (
              <span className="text-[11px] font-bold" style={{ color: 'var(--nav-success)' }}>
                {deltaPct >= 0 ? '+' : ''}{deltaPct}%
              </span>
            )}
          </div>
        ) : (
          <div className="text-[11.5px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
            {state === 'locked' ? LOCKED_TEXT : neutralText}
          </div>
        )}
      </div>
      {state === 'data' && sparkValues && sparkValues.length > 1 && (
        <Sparkline
          values={sparkValues}
          height={30}
          colorVar={sparkColorVar!}
          reduceMotion={reduceMotion}
          delay={reduceMotion ? 0 : 0.4 + index * 0.08}
        />
      )}
    </motion.div>
  )
}

// Period-scoped revenue area chart: gradient fill, drawn-in line (framer
// pathLength), and a floating label at the last non-zero day. Keyed by
// `period` at the call site so switching 7д/14д/30д replays the draw-in.
function RevenueAreaChart({ days, reduceMotion, period }: { days: { date: Date; total: number }[]; reduceMotion: boolean; period: number }) {
  const VIEW_W = 720
  const VIEW_H = 220
  const PAD_LEFT = 8
  const PAD_RIGHT = 8
  const PAD_TOP = 28
  const PAD_BOTTOM = 24
  const chartW = VIEW_W - PAD_LEFT - PAD_RIGHT
  const chartH = VIEW_H - PAD_TOP - PAD_BOTTOM

  const maxValue = Math.max(...days.map(d => d.total), 0)
  if (maxValue === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-center px-6 text-sm" style={{ color: 'var(--nav-text-muted)' }}>
        Пока нет оплаченных счетов за этот период
      </div>
    )
  }

  const x = (i: number) => PAD_LEFT + (i / (days.length - 1)) * chartW
  const y = (v: number) => PAD_TOP + chartH - (v / maxValue) * chartH

  const linePathD = days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)},${y(d.total).toFixed(2)}`).join(' ')
  const bottomY = PAD_TOP + chartH
  const areaPathD = `${linePathD} L ${x(days.length - 1).toFixed(2)},${bottomY} L ${x(0).toFixed(2)},${bottomY} Z`

  let endIdx = days.length - 1
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].total > 0) { endIdx = i; break }
  }
  const endX = x(endIdx)
  const endY = y(days[endIdx].total)
  const labelX = Math.max(endX - 7, 34)

  const tickIdx = Array.from(new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]))

  return (
    <div className="overflow-x-auto">
      <motion.svg
        key={period}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height="220"
        preserveAspectRatio="none"
        style={{ minWidth: '420px', display: 'block', overflow: 'visible' }}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
      >
        <defs>
          <linearGradient id="dashboardRevenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--nav-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--nav-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map(f => {
          const gy = PAD_TOP + chartH - f * chartH
          return <line key={f} x1={PAD_LEFT} y1={gy} x2={VIEW_W - PAD_RIGHT} y2={gy} stroke="var(--nav-text-muted)" strokeOpacity={0.12} strokeWidth={1} />
        })}

        <motion.path
          d={areaPathD}
          fill="url(#dashboardRevenueGradient)"
          stroke="none"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.6, delay: reduceMotion ? 0 : 0.35, ease: EASE }}
        />

        <motion.path
          d={linePathD}
          fill="none"
          stroke="var(--nav-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.9, ease: EASE }}
        />

        <motion.circle
          cx={endX} cy={endY} r={4}
          fill="var(--nav-accent)" stroke="var(--nav-bg)" strokeWidth={2.5}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 0.9, ease: EASE }}
        />
        <motion.text
          x={labelX} y={endY - 10} textAnchor="end"
          fontSize="10.5" fontWeight={700} fill="var(--nav-text-primary)"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 0.9, ease: EASE }}
        >
          {Math.round(days[endIdx].total).toLocaleString('ru-KZ')} ₸
        </motion.text>

        {tickIdx.map(i => (
          <text key={i} x={x(i)} y={VIEW_H - 6} textAnchor="middle" fontSize="9" fill="var(--nav-text-muted)">
            {`${days[i].date.getDate()} ${MONTH_ABBR_RU[days[i].date.getMonth()]}`}
          </text>
        ))}
      </motion.svg>
    </div>
  )
}

const PERIODS = [7, 14, 30] as const
type Period = typeof PERIODS[number]

export default function DashboardPage() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [period, setPeriod] = useState<Period>(14)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const [{ data }, { data: profile }] = await Promise.all([
      supabase.from('invoices').select('*, clients(name)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('is_admin').eq('id', user.id).single(),
    ])
    setInvoices(data || [])
    setIsAdmin(!!profile?.is_admin)
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
  const prevMonthInvoices = useMemo(() => {
    const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return invoices.filter(inv => {
      const d = new Date(inv.created_at)
      return d.getMonth() === pm.getMonth() && d.getFullYear() === pm.getFullYear()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices])

  const invoiceCountDelta = computeDelta(monthInvoices.length, prevMonthInvoices.length)

  // 60 days of {date, total (paid revenue), paidCount, createdCount} --
  // 60 (not 30) so the 30д period toggle still has a full preceding 30-day
  // window to compare its "Динамика" against.
  const dailyRaw = useMemo(() => {
    const days: { date: Date; total: number; paidCount: number; createdCount: number }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 59; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      days.push({ date: d, total: 0, paidCount: 0, createdCount: 0 })
    }
    const indexByDay = new Map(days.map((d, i) => [d.date.toDateString(), i]))
    invoices.forEach(inv => {
      const d = new Date(inv.created_at)
      d.setHours(0, 0, 0, 0)
      const idx = indexByDay.get(d.toDateString())
      if (idx === undefined) return
      days[idx].createdCount += 1
      if (inv.status === 'paid') {
        days[idx].total += Number(inv.amount)
        days[idx].paidCount += 1
      }
    })
    return days
  }, [invoices])

  const periodDays = useMemo(() => dailyRaw.slice(60 - period, 60), [dailyRaw, period])
  const prevPeriodDays = useMemo(() => dailyRaw.slice(60 - period * 2, 60 - period), [dailyRaw, period])

  const totalPeriod = periodDays.reduce((s, d) => s + d.total, 0)
  const paidCountPeriod = periodDays.reduce((s, d) => s + d.paidCount, 0)
  const avgInvoice = paidCountPeriod > 0 ? Math.round(totalPeriod / paidCountPeriod) : 0
  const prevTotalPeriod = prevPeriodDays.reduce((s, d) => s + d.total, 0)
  const trend = computeDelta(totalPeriod, prevTotalPeriod)

  const last14CreatedCounts = useMemo(() => dailyRaw.slice(46, 60).map(d => d.createdCount), [dailyRaw])

  const recentInvoices = invoices.slice(0, 5)
  const hasAnyInvoices = invoices.length > 0

  const kaspiState: ProductState = isAdmin ? 'neutral' : 'locked'
  const agentState: ProductState = isAdmin ? 'neutral' : 'locked'

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-5xl mx-auto p-4">
          {/* Header row */}
          <motion.div
            className="flex items-center justify-between mb-5"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
          >
            <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Главная</h2>
            <button
              onClick={() => router.push('/create')}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
            >
              <PlusIcon />
              Создать счёт
            </button>
          </motion.div>

          {/* Продукты платформы */}
          <div className="mb-6">
            <div className="text-[11px] font-extrabold uppercase mb-3" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>
              Продукты платформы
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {loading ? (
                [0, 1, 2].map(i => <div key={i} className="nav-glass nav-card-accent rounded-[22px] p-[18px]"><Skeleton className="h-8 w-8 rounded-[9px] mb-3" /><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-3 w-32" /></div>)
              ) : (
                <>
                  <ProductCard
                    index={0}
                    reduceMotion={reduceMotion}
                    icon={<InvoiceIcon />}
                    colorVar="--nav-accent"
                    softVar="--nav-accent-soft"
                    title="Счета"
                    state="data"
                    subtitle={`${monthInvoices.length} за этот месяц`}
                    deltaPct={invoiceCountDelta}
                    deltaLabel="к прошлому месяцу"
                    sparkValues={last14CreatedCounts}
                    onClick={() => router.push('/history')}
                  />
                  <ProductCard
                    index={1}
                    reduceMotion={reduceMotion}
                    icon={<ShopIcon />}
                    colorVar="--nav-teal"
                    softVar="--nav-teal-soft"
                    title="Kaspi Bot"
                    state={kaspiState}
                    neutralText="Показатели появятся здесь"
                    onClick={isAdmin ? () => router.push('/kaspi-shop') : undefined}
                  />
                  <ProductCard
                    index={2}
                    reduceMotion={reduceMotion}
                    icon={<AgentIcon />}
                    colorVar="--nav-magenta"
                    softVar="--nav-magenta-soft"
                    title="AI-агент"
                    state={agentState}
                    neutralText="Диалоги появятся здесь"
                    onClick={isAdmin ? () => router.push('/ai-agent/settings') : undefined}
                  />
                </>
              )}
            </div>
          </div>

          {/* Аналитика */}
          <div className="mb-6">
            <div className="text-[11px] font-extrabold uppercase mb-3" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>
              Аналитика
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
              {/* Main revenue chart card */}
              {loading ? (
                <div className="nav-glass nav-card-accent rounded-[24px] p-[22px_22px_12px]">
                  <Skeleton className="h-5 w-40 mb-4" />
                  <div className="flex gap-7 mb-4"><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-20" /></div>
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : (
                <motion.div
                  className="nav-glass nav-card-accent rounded-[24px] p-[22px_22px_12px]"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.1 }}
                >
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="text-[14.5px] font-semibold" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>
                      Выручка по счетам
                    </div>
                    <div className="relative flex items-center gap-0.5 rounded-full p-[3px]" style={{ background: 'var(--nav-bg)' }}>
                      {PERIODS.map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPeriod(p)}
                          className="relative px-[11px] py-[6px] rounded-full text-[11.5px] font-bold transition-colors duration-200"
                          style={{ color: period === p ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)' }}
                        >
                          {period === p && (
                            <motion.span
                              layoutId="periodPill"
                              className="absolute inset-0 rounded-full"
                              style={{ background: 'linear-gradient(120deg, var(--nav-accent), var(--nav-teal))', zIndex: 0 }}
                              transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                            />
                          )}
                          <span className="relative" style={{ zIndex: 1 }}>{p}д</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-7 flex-wrap mb-[18px]">
                    <div>
                      <div className="text-[11px] font-semibold" style={{ color: 'var(--nav-text-muted)' }}>Итого за период</div>
                      <div className="text-[21px] font-bold mt-[3px]" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.03em' }}>
                        <CountUp key={`total-${period}`} value={totalPeriod} reduceMotion={reduceMotion} format={n => `${n.toLocaleString('ru-KZ')} ₸`} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold" style={{ color: 'var(--nav-text-muted)' }}>Средний счёт</div>
                      <div className="text-[21px] font-bold mt-[3px]" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.03em' }}>
                        <CountUp key={`avg-${period}`} value={avgInvoice} reduceMotion={reduceMotion} format={n => `${n.toLocaleString('ru-KZ')} ₸`} />
                      </div>
                    </div>
                    {trend !== null && (
                      <div>
                        <div className="text-[11px] font-semibold" style={{ color: 'var(--nav-text-muted)' }}>Динамика</div>
                        <div className="text-[21px] font-bold mt-[3px]" style={{ color: 'var(--nav-success)', letterSpacing: '-0.03em' }}>
                          <CountUp key={`trend-${period}`} value={trend} reduceMotion={reduceMotion} format={n => `${n >= 0 ? '+' : ''}${n}%`} />
                        </div>
                      </div>
                    )}
                  </div>

                  <RevenueAreaChart days={periodDays} reduceMotion={reduceMotion} period={period} />
                </motion.div>
              )}

              {/* Side cards */}
              <div className="flex flex-col gap-[14px] h-full">
                {loading ? (
                  <>
                    <div className="nav-glass rounded-[18px] p-[15px_17px]"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-6 w-16" /></div>
                    <div className="nav-glass rounded-[18px] p-[15px_17px]"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-6 w-16" /></div>
                  </>
                ) : (
                  <>
                    <MiniCard
                      index={0}
                      reduceMotion={reduceMotion}
                      dotVar="--nav-accent"
                      label="Счета"
                      state="data"
                      value={monthInvoices.length.toLocaleString('ru-KZ')}
                      deltaPct={invoiceCountDelta}
                      sparkValues={last14CreatedCounts}
                      sparkColorVar="--nav-accent"
                      onClick={() => router.push('/history')}
                    />
                    <MiniCard
                      index={1}
                      reduceMotion={reduceMotion}
                      dotVar="--nav-teal"
                      label="Kaspi Bot"
                      state={kaspiState}
                      neutralText="Показатели появятся здесь"
                      onClick={isAdmin ? () => router.push('/kaspi-shop') : undefined}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Recent invoices */}
          <motion.div
            className={`nav-glass nav-card-accent rounded-2xl ${CARD_HOVER}`}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.25 }}
          >
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
              <div className="pb-2">
                {recentInvoices.map((inv, i) => (
                  <div
                    key={inv.id}
                    onClick={() => router.push('/invoice/' + inv.id)}
                    className="flex items-center justify-between mx-2 px-3 py-3 rounded-xl cursor-pointer transition-all duration-150 hover:translate-x-1 hover:bg-[var(--nav-surface-glass)]"
                    style={{
                      borderBottom: i < recentInvoices.length - 1 ? '1px solid var(--nav-border-soft)' : 'none',
                    }}
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
          </motion.div>
        </div>
      </main>
    </DesktopShell>
  )
}
