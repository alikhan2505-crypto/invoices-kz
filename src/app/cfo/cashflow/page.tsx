'use client'
import { useMemo, useState } from 'react'
import { buildCashflow, type CashflowRow } from '@/lib/cfo/cashflow'
import { monthKey, todayIso, yearMonths } from '@/lib/cfo/dates'
import { useCfo } from '../CfoWorkspace'
import ReportTable, { MEASURE_OPTIONS, type Measure, type ReportRow } from '../ReportTable'
import { CfoPage, Segmented, YearPicker } from '../ui'

// Остатки, сальдо и итог — чем больше, тем лучше; секция выплат — наоборот.
// Статьи получают направление из своего kind в маппинге ниже.
function higherIsBetter(r: CashflowRow): boolean {
  if (r.type === 'balance' || r.type === 'activity' || r.type === 'total') return true
  return !r.key.endsWith(':out')
}

export default function CfoCashflow() {
  const { ws } = useCfo()
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)))
  const [measure, setMeasure] = useState<Measure>('fact')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const months = useMemo(() => yearMonths(year), [year])

  const rows: ReportRow[] = useMemo(() => {
    const raw = buildCashflow({ accounts: ws.accounts, articles: ws.articles, operations: ws.operations, plan: ws.plan, months })
    const kindOf = new Map(ws.articles.map((a) => [a.id, a.kind]))
    return raw.map((r) => {
      const articleKind = r.type === 'article' ? kindOf.get(r.key.slice(2)) : undefined
      return {
        key: r.key,
        label: r.label,
        level: r.type === 'article' ? 2 : r.type === 'section' ? 1 : 0,
        strong: r.type !== 'article',
        toggleKey: r.type === 'activity' ? r.key : undefined,
        parentKey: (r.type === 'section' || r.type === 'article') && r.activity ? `act:${r.activity}` : undefined,
        cells: r.cells,
        total: r.total,
        higherIsBetter: r.type === 'article' ? articleKind === 'income' : higherIsBetter(r),
      }
    })
  }, [ws, months])

  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <CfoPage title="БДДС" actions={<><Segmented label="Показатель" value={measure} onChange={setMeasure} options={MEASURE_OPTIONS} /><YearPicker value={year} onChange={setYear} /></>}>
      <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        Деньги по дате оплаты, по видам деятельности. Остатки — по всем счетам и кассам, переводы между ними не считаются ни поступлением, ни выплатой.
      </p>
      <ReportTable months={months} rows={rows} measure={measure} collapsed={collapsed} onToggle={toggle} currentMonth={monthKey(todayIso())} />
    </CfoPage>
  )
}
