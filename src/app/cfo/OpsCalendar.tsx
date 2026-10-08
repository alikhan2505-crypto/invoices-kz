'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { daysInMonth } from '@/lib/cfo/dates'
import { monthTitle, opTitle } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import type { CfoAccount, CfoArticle, CfoOperation } from '@/lib/cfo/types'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const ITEMS_IN_TILE = 3

const net = (ops: CfoOperation[]) => ops.reduce((s, o) => s + (o.direction === 'in' ? o.amount : o.direction === 'out' ? -o.amount : 0), 0)
// Компактная сумма для плитки: 1 250 000 → «1,25 млн», 45 000 → «45 тыс».
function short(t: number): string {
  const v = Math.abs(t) / 100
  const sign = t < 0 ? '−' : '+'
  if (v >= 1_000_000) return `${sign}${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, '').replace('.', ',')} млн`
  if (v >= 1_000) return `${sign}${Math.round(v / 1_000)} тыс`
  return `${sign}${Math.round(v)}`
}

// Месяцы плитками по 7 дней (с понедельника), друг под другом — листаются обычной прокруткой.
export default function OpsCalendar({ months, byDate, today, selected, onSelect, accounts, articles, scrollToMonth, dayPanel }: {
  months: string[]
  byDate: Map<string, CfoOperation[]>
  today: string
  selected: string | null
  onSelect: (date: string) => void
  accounts: CfoAccount[]
  articles: CfoArticle[]
  scrollToMonth: string
  dayPanel?: ReactNode // карточка выбранного дня — встаёт сразу под его месяцем
}) {
  const anchor = useRef<HTMLDivElement | null>(null)
  useEffect(() => { anchor.current?.scrollIntoView({ block: 'start' }) }, [scrollToMonth])

  return (
    <div className="space-y-6">
      {months.map((m) => {
        const [y, mo] = m.split('-').map(Number)
        const offset = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7
        const days = Array.from({ length: daysInMonth(m) }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`)
        const monthOps = days.flatMap((d) => byDate.get(d) ?? [])
        const monthNet = net(monthOps.filter((o) => o.direction !== 'transfer'))
        return (
          <section key={m} ref={m === scrollToMonth ? anchor : undefined} aria-label={monthTitle(m)} className="scroll-mt-4">
            <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
              <h2 className="text-lg font-bold" style={{ color: 'var(--nav-text-primary)' }}>{monthTitle(m)}</h2>
              {monthOps.length > 0 && (
                <span className="text-sm tabular-nums" style={{ color: monthNet < 0 ? 'var(--nav-critical)' : 'var(--nav-text-secondary)' }}>
                  {monthOps.length} опер. · итог {monthNet > 0 ? '+' : ''}{formatTenge(monthNet)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className="text-[11px] font-semibold text-center pb-1" style={{ color: i >= 5 ? 'var(--nav-critical)' : 'var(--nav-text-muted)' }}>{w}</div>
              ))}
              {Array.from({ length: offset }, (_, i) => <div key={`pad${i}`} />)}
              {days.map((d) => {
                const ops = byDate.get(d) ?? []
                const dayNet = net(ops.filter((o) => o.direction !== 'transfer'))
                const isToday = d === today
                const isSel = d === selected
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onSelect(d)}
                    aria-pressed={isSel}
                    aria-label={`${Number(d.slice(8))} ${monthTitle(m)}: ${ops.length ? `${ops.length} операций, итог ${formatTenge(dayNet)}` : 'операций нет'}`}
                    className="min-h-[60px] sm:min-h-[104px] rounded-lg p-1 sm:p-1.5 text-left flex flex-col gap-0.5 overflow-hidden transition-colors"
                    style={{
                      background: isSel ? 'var(--nav-accent-soft)' : 'var(--nav-surface-chrome)',
                      border: `1px solid ${isToday ? 'var(--nav-accent)' : 'var(--nav-border-soft)'}`,
                      opacity: d < today && ops.length === 0 ? 0.7 : 1,
                    }}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold" style={{ color: isToday ? 'var(--nav-accent)' : 'var(--nav-text-primary)' }}>{Number(d.slice(8))}</span>
                      {ops.length > 0 && dayNet !== 0 && (
                        <span className="text-[10px] sm:text-[11px] font-semibold tabular-nums truncate" style={{ color: dayNet < 0 ? 'var(--nav-critical)' : 'var(--nav-success)' }}>{short(dayNet)}</span>
                      )}
                    </span>
                    {/* На телефоне в плитке только сумма дня — детали по нажатию. */}
                    <span className="hidden sm:flex flex-col gap-0.5 min-w-0">
                      {ops.slice(0, ITEMS_IN_TILE).map((o) => (
                        <span key={o.id} className="text-[11px] leading-tight truncate rounded px-1" style={{
                          background: o.status === 'planned' ? 'var(--nav-accent-soft)' : 'var(--nav-surface-glass)',
                          color: o.direction === 'out' ? 'var(--nav-critical)' : o.direction === 'in' ? 'var(--nav-success)' : 'var(--nav-text-secondary)',
                        }}>
                          {o.direction === 'out' ? '−' : o.direction === 'in' ? '+' : '⇄'}{formatTenge(o.amount).replace(' ₸', '')} {o.counterparty || opTitle(o, accounts, articles)}
                        </span>
                      ))}
                      {ops.length > ITEMS_IN_TILE && <span className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>ещё {ops.length - ITEMS_IN_TILE}</span>}
                    </span>
                    {ops.length > 0 && <span className="sm:hidden text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>{ops.length} оп.</span>}
                  </button>
                )
              })}
            </div>
            {selected && selected.startsWith(m) && dayPanel && <div className="mt-3">{dayPanel}</div>}
          </section>
        )
      })}
    </div>
  )
}
