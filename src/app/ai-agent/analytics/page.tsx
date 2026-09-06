'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { buildAgentSettingsHref } from '@/lib/aiAgent/settingsLink'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'

const EASE = [0.16, 1, 0.3, 1] as const
const MONTH_ABBR_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

const PERIODS = [7, 14, 30] as const
type Period = typeof PERIODS[number]

type AgentListItem = { id: string; name: string }
type AnalyticsDay = { date: string; inbound: number; outbound: number }
type AnalyticsData = {
  days: AnalyticsDay[]
  totals: { conversations: number; replies: number; spendTenge: number }
}

// Same mount-once integer count-up as dashboard/page.tsx's CountUp --
// callers remount it (via key) whenever the underlying value's scope
// changes, so it replays for a new period/agent selection.
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

function parseDay(date: string): Date {
  return new Date(`${date}T00:00:00`)
}

// Dual-series area chart in the house RevenueAreaChart style
// (dashboard/page.tsx): gradient fills, pathLength draw-in, shared hover
// guide with a two-value tooltip. Keyed by the caller on period+agent so
// changing either replays the draw-in.
function MessagesChart({ days, reduceMotion }: { days: AnalyticsDay[]; reduceMotion: boolean }) {
  const VIEW_W = 720
  const VIEW_H = 220
  // Left padding fits the y-axis value labels (0 / mid / max) -- without
  // them the founder couldn't read any values off the chart at all.
  const PAD_LEFT = 34
  const PAD_RIGHT = 8
  const PAD_TOP = 28
  const PAD_BOTTOM = 24
  const chartW = VIEW_W - PAD_LEFT - PAD_RIGHT
  const chartH = VIEW_H - PAD_TOP - PAD_BOTTOM

  const [hover, setHover] = useState<{ i: number; x: number } | null>(null)

  const maxValue = Math.max(...days.map(d => Math.max(d.inbound, d.outbound)), 1)

  // Guarded denominator: a single-day window would otherwise divide by zero
  // and NaN every coordinate. With one day, the point sits at the left edge.
  const denom = Math.max(days.length - 1, 1)
  const x = (i: number) => PAD_LEFT + (i / denom) * chartW
  const y = (v: number) => PAD_TOP + chartH - (v / maxValue) * chartH
  const bottomY = PAD_TOP + chartH

  function linePath(pick: (d: AnalyticsDay) => number): string {
    return days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)},${y(pick(d)).toFixed(2)}`).join(' ')
  }
  function areaPath(lineD: string): string {
    return `${lineD} L ${x(days.length - 1).toFixed(2)},${bottomY} L ${x(0).toFixed(2)},${bottomY} Z`
  }

  const inboundLineD = linePath(d => d.inbound)
  const outboundLineD = linePath(d => d.outbound)

  // Endpoint markers in the house RevenueAreaChart style (dashboard): a dot
  // plus the value at the LAST NON-ZERO point of each series -- so even a
  // single spike on the final day (the founder's screenshot problem) carries
  // a readable number without hovering.
  function lastNonZeroIndex(pick: (d: AnalyticsDay) => number): number {
    for (let i = days.length - 1; i >= 0; i--) if (pick(days[i]) > 0) return i
    return -1
  }
  const inboundEnd = lastNonZeroIndex(d => d.inbound)
  const outboundEnd = lastNonZeroIndex(d => d.outbound)
  const inEndY = inboundEnd >= 0 ? y(days[inboundEnd].inbound) : 0
  const outEndY = outboundEnd >= 0 ? y(days[outboundEnd].outbound) : 0
  let inLabelY = inEndY - 9
  let outLabelY = outEndY - 9
  // Both series ending on the same point with close values would overlap
  // their labels -- the lower one moves below its dot instead.
  if (inboundEnd >= 0 && outboundEnd >= 0 && inboundEnd === outboundEnd && Math.abs(inEndY - outEndY) < 18) {
    if (inEndY <= outEndY) outLabelY = Math.min(outEndY + 16, bottomY - 4)
    else inLabelY = Math.min(inEndY + 16, bottomY - 4)
  }
  const endLabelX = (i: number) => Math.max(x(i) - 7, PAD_LEFT + 22)

  const tickIdx = Array.from(new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]))

  function nearestIndex(mx: number) {
    const ratio = (mx - PAD_LEFT) / chartW
    const i = Math.round(ratio * (days.length - 1))
    return Math.max(0, Math.min(days.length - 1, i))
  }

  function handlePointer(e: React.PointerEvent<SVGRectElement>) {
    const svgEl = e.currentTarget.ownerSVGElement!
    const rect = svgEl.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * VIEW_W
    const i = nearestIndex(mx)
    setHover({ i, x: x(i) })
  }

  function handlePointerLeave(e: React.PointerEvent<SVGRectElement>) {
    // A tap on touch stands in for hover -- it stays put until the next tap
    // (same rule as the dashboard chart).
    if (e.pointerType === 'touch') return
    setHover(null)
  }

  const hoverRatio = hover ? hover.x / VIEW_W : 0
  const tooltipFlip = hoverRatio > 0.72

  return (
    <div className="overflow-x-auto">
      <div style={{ position: 'relative', minWidth: '420px' }}>
        <motion.svg
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
            <linearGradient id="aiAnalyticsInboundGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--nav-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--nav-accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="aiAnalyticsOutboundGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--nav-teal)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--nav-teal)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map(f => {
            const gy = PAD_TOP + chartH - f * chartH
            const value = Math.round(maxValue * f)
            // On a tiny max (e.g. 1) the mid label rounds into a duplicate
            // of 0 or max -- skip it rather than print the same number twice.
            const showLabel = f !== 0.5 || (value !== 0 && value !== maxValue)
            return (
              <g key={f}>
                <line x1={PAD_LEFT} y1={gy} x2={VIEW_W - PAD_RIGHT} y2={gy} stroke="var(--nav-text-muted)" strokeOpacity={0.12} strokeWidth={1} />
                {showLabel && (
                  <text x={PAD_LEFT - 7} y={gy + 3} textAnchor="end" fontSize="9" fill="var(--nav-text-muted)">
                    {value.toLocaleString('ru-KZ')}
                  </text>
                )}
              </g>
            )
          })}

          <motion.path
            d={areaPath(inboundLineD)}
            fill="url(#aiAnalyticsInboundGradient)"
            stroke="none"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.6, delay: reduceMotion ? 0 : 0.35, ease: EASE }}
          />
          <motion.path
            d={areaPath(outboundLineD)}
            fill="url(#aiAnalyticsOutboundGradient)"
            stroke="none"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.6, delay: reduceMotion ? 0 : 0.45, ease: EASE }}
          />

          <motion.path
            d={inboundLineD}
            fill="none"
            stroke="var(--nav-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.9, ease: EASE }}
          />
          <motion.path
            d={outboundLineD}
            fill="none"
            stroke="var(--nav-teal)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.9, delay: reduceMotion ? 0 : 0.12, ease: EASE }}
          />

          {inboundEnd >= 0 && (
            <>
              <motion.circle
                cx={x(inboundEnd)} cy={inEndY} r={4}
                fill="var(--nav-accent)" stroke="var(--nav-bg)" strokeWidth={2.5}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 0.9, ease: EASE }}
              />
              <motion.text
                x={endLabelX(inboundEnd)} y={inLabelY} textAnchor="end"
                fontSize="10.5" fontWeight={700} fill="var(--nav-accent)"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 0.9, ease: EASE }}
              >
                {days[inboundEnd].inbound.toLocaleString('ru-KZ')}
              </motion.text>
            </>
          )}
          {outboundEnd >= 0 && (
            <>
              <motion.circle
                cx={x(outboundEnd)} cy={outEndY} r={4}
                fill="var(--nav-teal)" stroke="var(--nav-bg)" strokeWidth={2.5}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 1, ease: EASE }}
              />
              <motion.text
                x={endLabelX(outboundEnd)} y={outLabelY} textAnchor="end"
                fontSize="10.5" fontWeight={700} fill="var(--nav-teal)"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 1, ease: EASE }}
              >
                {days[outboundEnd].outbound.toLocaleString('ru-KZ')}
              </motion.text>
            </>
          )}

          {tickIdx.map(i => {
            const d = parseDay(days[i].date)
            return (
              <text key={i} x={x(i)} y={VIEW_H - 6} textAnchor="middle" fontSize="9" fill="var(--nav-text-muted)">
                {`${d.getDate()} ${MONTH_ABBR_RU[d.getMonth()]}`}
              </text>
            )
          })}

          {hover && (
            <>
              <line
                x1={hover.x} x2={hover.x} y1={PAD_TOP} y2={bottomY}
                stroke="var(--nav-text-muted)" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="3 3"
              />
              <circle cx={hover.x} cy={y(days[hover.i].inbound)} r={4.5} fill="var(--nav-accent)" stroke="var(--nav-bg)" strokeWidth={2.5} />
              <circle cx={hover.x} cy={y(days[hover.i].outbound)} r={4.5} fill="var(--nav-teal)" stroke="var(--nav-bg)" strokeWidth={2.5} />
            </>
          )}

          <rect
            x={0} y={0} width={VIEW_W} height={VIEW_H} fill="transparent"
            style={{ cursor: 'crosshair', pointerEvents: 'all' }}
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={handlePointerLeave}
          />
        </motion.svg>

        {hover && (
          <div
            className="nav-glass"
            style={{
              position: 'absolute',
              left: `${hoverRatio * 100}%`,
              top: Math.min(y(days[hover.i].inbound), y(days[hover.i].outbound)) - 10,
              transform: tooltipFlip ? 'translate(calc(-100% - 10px), -100%)' : 'translate(10px, -100%)',
              padding: '6px 10px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--nav-text-primary)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: 'var(--nav-card-glow)',
              zIndex: 2,
            }}
          >
            <div style={{ fontSize: '9.5px', fontWeight: 500, color: 'var(--nav-text-muted)' }}>
              {(() => { const d = parseDay(days[hover.i].date); return `${d.getDate()} ${MONTH_ABBR_RU[d.getMonth()]}` })()}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--nav-accent)' }} />
              Входящие: {days[hover.i].inbound}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--nav-teal)' }} />
              Ответы: {days[hover.i].outbound}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  index, reduceMotion, dotVar, label, value, format, remountKey,
}: {
  index: number
  reduceMotion: boolean
  dotVar: string
  label: string
  value: number
  format?: (n: number) => string
  remountKey: string
}) {
  return (
    <motion.div
      className="nav-glass nav-card-accent rounded-2xl p-[15px_17px]"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.08 + index * 0.05 }}
    >
      <div className="text-[11.5px] font-bold flex items-center gap-[7px]" style={{ color: 'var(--nav-text-secondary)' }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `var(${dotVar})` }} />
        {label}
      </div>
      <div className="text-xl font-bold mt-1.5" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.03em' }}>
        <CountUp key={remountKey} value={value} reduceMotion={reduceMotion} format={format} />
      </div>
    </motion.div>
  )
}

export default function AiAgentAnalytics() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [period, setPeriod] = useState<Period>(30)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [fetching, setFetching] = useState(false)

  const loadAnalytics = useCallback(async (agent: string, days: Period) => {
    setFetching(true)
    const { data: { session } } = await supabase.auth.getSession()
    const headers = { 'Authorization': `Bearer ${session?.access_token}` }
    const params = new URLSearchParams({ days: String(days) })
    if (agent !== 'all') params.set('agentId', agent)
    const res = await fetch(`/api/ai-agent/analytics?${params}`, { headers })
    if (res.ok) {
      const payload = await res.json()
      setData(payload)
    }
    setFetching(false)
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Same admin-only client-side check as ../page.tsx -- the real
      // enforcement is the API's 403 admin_only; this swaps a redirect for
      // an inline message.
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      if (!profile?.is_admin && !getActivePlan(profile).canAiAgent) { setForbidden(true); setLoading(false); return }
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Authorization': `Bearer ${session?.access_token}` }
      const res = await fetch('/api/ai-agent/agents', { headers })
      if (res.ok) {
        const payload = await res.json()
        setAgents(Array.isArray(payload.agents) ? payload.agents.map((a: any) => ({ id: a.id, name: a.name })) : [])
      }
      await loadAnalytics('all', 30)
      setLoading(false)
    }
    load()
  }, [router, loadAnalytics])

  function changeAgent(id: string) {
    setAgentFilter(id)
    loadAnalytics(id, period)
  }

  function changePeriod(p: Period) {
    setPeriod(p)
    loadAnalytics(agentFilter, p)
  }

  const scopeKey = `${agentFilter}-${period}`
  const hasData = !!data && (data.totals.conversations > 0 || data.totals.replies > 0 || data.days.some(d => d.inbound > 0 || d.outbound > 0))

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (forbidden) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Эта функция пока доступна только администраторам.</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-3xl mx-auto p-4 lg:p-6 pb-6">
        <motion.div
          className="flex items-start justify-between gap-3 mb-6 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Аналитика</h1>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Диалоги, ответы и расходы ваших AI-агентов</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {agents.length > 0 && (
              <select
                value={agentFilter}
                onChange={e => changeAgent(e.target.value)}
                aria-label="Выбор агента"
                className="nav-glass rounded-lg px-3 py-2 text-sm font-medium outline-none cursor-pointer"
                style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
              >
                <option value="all">Все агенты</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <div className="relative flex items-center gap-0.5 rounded-full p-[3px]" style={{ background: 'var(--nav-bg)' }}>
              {PERIODS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => changePeriod(p)}
                  className="relative px-[11px] py-[6px] rounded-full text-[11.5px] font-bold transition-colors duration-200"
                  style={{ color: period === p ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)' }}
                >
                  {period === p && (
                    <motion.span
                      layoutId="aiAnalyticsPeriodPill"
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
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <StatCard index={0} reduceMotion={reduceMotion} dotVar="--nav-accent" label="Диалогов"
            value={data?.totals.conversations ?? 0} remountKey={`conv-${scopeKey}`} />
          <StatCard index={1} reduceMotion={reduceMotion} dotVar="--nav-teal" label="Ответов агента"
            value={data?.totals.replies ?? 0} remountKey={`replies-${scopeKey}`} />
          <StatCard index={2} reduceMotion={reduceMotion} dotVar="--nav-success" label="Потрачено ₸"
            value={data?.totals.spendTenge ?? 0} format={n => `${n.toLocaleString('ru-KZ')} ₸`} remountKey={`spend-${scopeKey}`} />
        </div>

        <motion.div
          className="nav-glass nav-card-accent rounded-2xl p-[22px_22px_12px]"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.2 }}
          style={{ opacity: fetching ? 0.7 : undefined }}
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[14.5px] font-semibold" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>
              Сообщения и ответы
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--nav-accent)' }} />
                Входящие
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--nav-teal)' }} />
                Ответы
              </span>
            </div>
          </div>

          {hasData && data ? (
            <MessagesChart key={scopeKey} days={data.days} reduceMotion={reduceMotion} />
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-center px-6 pb-4">
              <div className="text-sm mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                Пока нет диалогов — подключите канал или попробуйте Тестовый чат
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Link href={buildAgentSettingsHref(agentFilter, agents)}
                  className="inline-flex items-center rounded-lg px-3.5 py-2 text-xs font-semibold transition-transform hover:-translate-y-0.5"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
                  Подключить канал
                </Link>
                <Link href="/ai-agent/test-chat"
                  className="inline-flex items-center nav-glass rounded-lg px-3.5 py-2 text-xs font-semibold transition-transform hover:-translate-y-0.5"
                  style={{ color: 'var(--nav-text-primary)' }}>
                  Тестовый чат
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </main>
    </DesktopShell>
  )
}
