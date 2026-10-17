'use client'
import { useMemo, useState } from 'react'
import { buildCashflow, type CashflowRow } from '@/lib/cfo/cashflow'
import { monthKey, todayIso, yearMonths } from '@/lib/cfo/dates'
import { displayName, vocab } from '@/lib/cfo/mode'
import { useCfo } from '../CfoWorkspace'
import ReportTable, { MEASURE_OPTIONS, type Measure, type ReportRow } from '../ReportTable'
import { CfoPage, Segmented, YearPicker } from '../ui'
import ExportButton from '../ExportButton'
import { downloadWorkbook, reportSheets } from '@/lib/cfo/exportXlsx'

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
  const currentMonth = monthKey(todayIso())
  const v = vocab(ws.mode)

  const rows: ReportRow[] = useMemo(() => {
    const raw = buildCashflow({ accounts: ws.accounts, articles: ws.articles, operations: ws.operations, plan: ws.plan, months, mode: ws.mode })
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
        // Синтетические строки кредитов («Платежи по кредитам» / «Получено по кредиту») — по секции.
        higherIsBetter: r.type === 'article' ? (articleKind ? articleKind === 'income' : r.key === 'a:loan-received') : higherIsBetter(r),
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
    <CfoPage title={v.cashflow} actions={<><ExportButton onExport={() => downloadWorkbook(`${v.cashflow} ${year} — ${displayName(ws)}.xlsx`, reportSheets(months, rows, currentMonth))} /><Segmented label="Показатель" value={measure} onChange={setMeasure} options={MEASURE_OPTIONS} /><YearPicker value={year} onChange={setYear} /></>}>
      <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        {v.cashflowHint}
      </p>
      <ReportTable months={months} rows={rows} measure={measure} collapsed={collapsed} onToggle={toggle} currentMonth={currentMonth} />
    </CfoPage>
  )
}
