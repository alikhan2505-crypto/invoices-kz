'use client'
import { useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { accountBalanceAt } from '@/lib/cfo/balances'
import { buildDashboard } from '@/lib/cfo/dashboard'
import { monthKey, todayIso } from '@/lib/cfo/dates'
import { dayLabel, monthTitle, opTitle, shortMonth } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import { useCfo } from '../CfoWorkspace'
import { Card, CfoPage, EmptyState, Money, SectionTitle, inputClass, inputStyle } from '../ui'

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="nav-glass rounded-2xl p-4">
      <div className="text-[11px] font-semibold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: tone === 'bad' ? 'var(--nav-critical)' : tone === 'good' ? 'var(--nav-success)' : 'var(--nav-text-primary)' }}>{value}</div>
      {sub && <div className="mt-1 text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{sub}</div>}
    </div>
  )
}

export default function CfoOverview() {
  const { ws } = useCfo()
  const today = todayIso()
  const [month, setMonth] = useState(monthKey(today))
  const d = useMemo(() => buildDashboard({ accounts: ws.accounts, articles: ws.articles, operations: ws.operations, recurrences: ws.recurrences, plan: ws.plan, month, today }), [ws, month, today])

  if (ws.operations.length === 0 && ws.recurrences.length === 0) {
    return (
      <CfoPage title="Обзор">
        <EmptyState title="Добавьте первую операцию" hint="Как только появятся приходы и расходы, здесь будут выручка, прибыль, запас денег и ближайшие платежи." href="/cfo/operations" cta="Перейти к операциям" />
      </CfoPage>
    )
  }

  // Как в утверждённом макете: «план 5 200 000 ₸ · −7%».
  const planNote = (c: { plan: number; fact: number }) => {
    if (!c.plan) return 'плана нет'
    const pct = Math.round(((c.fact - c.plan) / Math.abs(c.plan)) * 100)
    return `план ${formatTenge(c.plan)} · ${pct > 0 ? '+' : ''}${pct}%`
  }
  const actual = ws.operations.filter((o) => o.status === 'actual')
  const byAccount = ws.accounts
    .filter((a) => !a.archived)
    .map((a) => `${a.name} ${formatTenge(accountBalanceAt(a, actual, today))}`)
    .join(' · ')
  const breakeven = d.breakeven.kind === 'ok' ? formatTenge(d.breakeven.value) : d.breakeven.kind === 'unreachable' ? 'не достигается' : '—'
  const breakevenSub = d.breakeven.kind === 'ok' ? 'выручка в месяц, при которой прибыль = 0' : d.breakeven.kind === 'unreachable' ? 'при текущей марже' : 'нет выручки за месяц'
  const maxExpense = d.expenseStructure[0]?.amount ?? 0

  return (
    <CfoPage
      title="Обзор"
      actions={<input type="month" aria-label="Месяц" className={`${inputClass} max-w-[180px]`} style={inputStyle} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
    >
      {d.firstGap && (
        <Card className="!py-3">
          <p className="text-sm font-medium" style={{ color: 'var(--nav-critical)' }}>
            Кассовый разрыв {dayLabel(d.firstGap)} — по плановым платежам денег не хватит. <a href="/cfo/calendar" className="underline">Открыть календарь</a>
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi label={`Выручка · ${monthTitle(month)}`} value={formatTenge(d.revenue.fact)} sub={planNote(d.revenue)} />
        <Kpi label="Валовая маржа" value={d.grossMarginPct === null ? '—' : `${Math.round(d.grossMarginPct)}%`} sub="(выручка − себестоимость) ÷ выручка" />
        <Kpi label="Чистая прибыль" value={formatTenge(d.netProfit.fact)} sub={planNote(d.netProfit)} tone={d.netProfit.fact < 0 ? 'bad' : undefined} />
        <Kpi label="Деньги сейчас" value={formatTenge(d.cashNow)} sub={byAccount || 'на всех счетах и в кассах'} tone={d.cashNow < 0 ? 'bad' : undefined} />
        <Kpi label="Запас денег" value={d.runwayDays === null ? '—' : `${d.runwayDays} дн.`} sub={d.runwayDays === null ? 'нет выплат за 90 дней' : 'без новых поступлений, по средним выплатам за 90 дней'} tone={d.runwayDays !== null && d.runwayDays < 30 ? 'bad' : undefined} />
        <Kpi label="Точка безубыточности" value={breakeven} sub={breakevenSub} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <SectionTitle>Доходы и расходы за 12 месяцев</SectionTitle>
          <div className="flex gap-4 text-xs mb-2" style={{ color: 'var(--nav-text-secondary)' }}>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--nav-success)' }} />Доходы</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--nav-magenta)' }} />Расходы</span>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.monthly.map((x) => ({ name: shortMonth(x.month), income: x.income / 100, expense: x.expense / 100 }))}>
                <XAxis dataKey="name" tick={{ fill: 'var(--nav-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v, name) => [formatTenge(Math.round(Number(v) * 100)), name === 'income' ? 'Доходы' : 'Расходы']}
                  contentStyle={{ background: 'var(--nav-surface-chrome)', border: '1px solid var(--nav-border)', borderRadius: 12, color: 'var(--nav-text-primary)' }}
                  cursor={{ fill: 'var(--nav-surface-glass)' }}
                />
                <Bar dataKey="income" fill="var(--nav-success)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="var(--nav-magenta)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle>Расходы · {monthTitle(month)}</SectionTitle>
          {d.expenseStructure.length === 0 && <p className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>Расходов за месяц нет.</p>}
          <div className="space-y-2">
            {d.expenseStructure.slice(0, 8).map((x) => (
              <div key={x.articleId}>
                <div className="flex justify-between gap-2 text-sm">
                  <span style={{ color: 'var(--nav-text-primary)' }}>{x.name}</span>
                  <span className="tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{formatTenge(x.amount)}</span>
                </div>
                <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--nav-surface-glass)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${maxExpense ? (x.amount / maxExpense) * 100 : 0}%`, background: 'var(--nav-accent)' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>Платежи на 7 дней</SectionTitle>
        {d.upcoming.length === 0 && <p className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>Плановых платежей на неделю нет.</p>}
        {d.upcoming.map((op) => (
          <div key={op.id} className="flex items-center gap-3 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
            <span className="w-28 text-xs" style={{ color: 'var(--nav-text-muted)' }}>{dayLabel(op.paidOn)}</span>
            <span className="flex-1 min-w-[160px] text-sm" style={{ color: 'var(--nav-text-primary)' }}>{opTitle(op, ws.accounts, ws.articles)}</span>
            {op.direction === 'transfer'
              ? <span className="text-sm tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{formatTenge(op.amount)}</span>
              : <Money value={op.direction === 'in' ? op.amount : -op.amount} signed className="text-sm font-semibold" />}
          </div>
        ))}
      </Card>
    </CfoPage>
  )
}
