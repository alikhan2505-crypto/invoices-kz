'use client'
import { useMemo, useState } from 'react'
import { addDays } from '@/lib/cfo/dates'
import { dayLabel } from '@/lib/cfo/labels'
import { formatTenge, parseAmountInput } from '@/lib/cfo/money'
import { NO_CHANGE, runScenario, type Scenario } from '@/lib/cfo/scenario'
import { useCfo } from './CfoWorkspace'
import { Card, Field, GhostButton, SectionTitle, inputClass, inputStyle } from './ui'

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm mb-1" style={{ color: 'var(--nav-text-primary)' }}>
        {label}<b className="tabular-nums">{value > 0 ? '+' : value < 0 ? '−' : ''}{Math.abs(value)}%</b>
      </span>
      <input type="range" min={-50} max={50} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full min-h-[44px]" style={{ accentColor: 'var(--nav-accent)' }} />
    </label>
  )
}

// «Что если» поверх платёжного календаря: ничего не сохраняет, только пересчитывает прогноз.
export default function ScenarioCard({ today, onClose }: { today: string; onClose: () => void }) {
  const { ws, pro } = useCfo()
  const [incomePct, setIncome] = useState(0)
  const [expensePct, setExpense] = useState(0)
  const [extraAmount, setExtraAmount] = useState('')
  const [extraDate, setExtraDate] = useState(addDays(today, 14))
  const [extraDir, setExtraDir] = useState<'in' | 'out'>('out')

  const scenario: Scenario = useMemo(() => {
    const amount = parseAmountInput(extraAmount)
    return { incomePct, expensePct, extra: amount && extraDate >= today ? { amount, date: extraDate, direction: extraDir } : null }
  }, [incomePct, expensePct, extraAmount, extraDate, extraDir, today])
  const base = useMemo(() => runScenario(ws, today, NO_CHANGE), [ws, today])
  const what = useMemo(() => runScenario(ws, today, scenario), [ws, today, scenario])

  if (!pro) {
    return (
      <Card>
        <SectionTitle>Что если</SectionTitle>
        <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Сценарии «выручка упадёт на 20%», «наймём двоих», «купим оборудование» — и сразу видно, будет ли кассовый разрыв. Доступно на тарифе Про.</p>
        <a href="/upgrade" className="inline-flex items-center min-h-[44px] mt-3 rounded-xl px-4 text-sm font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>Перейти на Про</a>
      </Card>
    )
  }

  const gap = (d: string | null) => (d ? dayLabel(d) : 'нет')
  const row = (label: string, a: string, b: string, worse: boolean) => (
    <div className="flex justify-between gap-3 py-2 text-sm flex-wrap" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
      <span style={{ color: 'var(--nav-text-secondary)' }}>{label}</span>
      <span className="tabular-nums">
        <span style={{ color: 'var(--nav-text-muted)' }}>{a}</span> → <b style={{ color: worse ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}>{b}</b>
      </span>
    </div>
  )

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-2">
        <SectionTitle>Что если</SectionTitle>
        <GhostButton type="button" onClick={onClose}>Закрыть</GhostButton>
      </div>
      <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>Двигайте ползунки — прогноз на 90 дней пересчитается. Ничего не сохраняется.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Slider label="Плановые поступления" value={incomePct} onChange={setIncome} />
        <Slider label="Плановые выплаты" value={expensePct} onChange={setExpense} />
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-3">
        <Field label="Разовый платёж, ₸">
          <input className={inputClass} style={inputStyle} inputMode="decimal" placeholder="например 2 000 000" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} />
        </Field>
        <Field label="Когда">
          <input type="date" className={inputClass} style={inputStyle} value={extraDate} min={today} onChange={(e) => setExtraDate(e.target.value)} />
        </Field>
        <Field label="Это">
          <select className={inputClass} style={inputStyle} value={extraDir} onChange={(e) => setExtraDir(e.target.value as 'in' | 'out')}>
            <option value="out">Выплата (покупка, найм…)</option>
            <option value="in">Поступление (кредит, крупный заказ…)</option>
          </select>
        </Field>
      </div>
      <div className="mt-4">
        {row('Кассовый разрыв', gap(base.calendar.firstGap), gap(what.calendar.firstGap), !!what.calendar.firstGap && (!base.calendar.firstGap || what.calendar.firstGap < base.calendar.firstGap))}
        {row('Самый низкий остаток', `${formatTenge(base.minBalance)} (${dayLabel(base.minDate)})`, `${formatTenge(what.minBalance)} (${dayLabel(what.minDate)})`, what.minBalance < base.minBalance)}
        {row('Остаток через 90 дней', formatTenge(base.endBalance), formatTenge(what.endBalance), what.endBalance < base.endBalance)}
      </div>
    </Card>
  )
}
