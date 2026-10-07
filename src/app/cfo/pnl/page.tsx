'use client'
import { useMemo, useState } from 'react'
import { monthKey, todayIso, yearMonths } from '@/lib/cfo/dates'
import { buildPnl, type PnlRow } from '@/lib/cfo/pnl'
import { useCfo } from '../CfoWorkspace'
import ReportTable, { MEASURE_OPTIONS, type Measure, type ReportRow } from '../ReportTable'
import { CfoPage, Segmented, YearPicker } from '../ui'

// Выше — лучше для выручки, прочих (они со знаком) и итогов; для расходов — наоборот.
function higherIsBetter(r: PnlRow): boolean {
  return r.type === 'total' || r.group === 'revenue' || r.group === 'finance'
}

export default function CfoPnl() {
  const { ws } = useCfo()
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)))
  const [measure, setMeasure] = useState<Measure>('fact')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const months = useMemo(() => yearMonths(year), [year])

  const rows: ReportRow[] = useMemo(() => buildPnl({ articles: ws.articles, operations: ws.operations, plan: ws.plan, months }).map((r) => ({
    key: r.key,
    label: r.label,
    level: r.type === 'article' ? 1 : 0,
    strong: r.type !== 'article',
    toggleKey: r.type === 'group' ? r.key : undefined,
    parentKey: r.type === 'article' && r.group ? `g:${r.group}` : undefined,
    cells: r.cells,
    total: r.total,
    higherIsBetter: higherIsBetter(r),
  })), [ws, months])

  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <CfoPage title="БДР" actions={<><Segmented label="Показатель" value={measure} onChange={setMeasure} options={MEASURE_OPTIONS} /><YearPicker value={year} onChange={setYear} /></>}>
      <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        Доходы и расходы по дате начисления. Кредиты, вложения и вывод денег собственником, покупка оборудования и переводы между счетами сюда не входят — они в БДДС.
      </p>
      <ReportTable months={months} rows={rows} measure={measure} collapsed={collapsed} onToggle={toggle} currentMonth={monthKey(todayIso())} />
    </CfoPage>
  )
}
