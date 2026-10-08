'use client'
import { useMemo, useState } from 'react'
import { monthKey, todayIso, yearMonths } from '@/lib/cfo/dates'
import { buildPnl, type PnlRow } from '@/lib/cfo/pnl'
import { useCfo } from '../CfoWorkspace'
import ReportTable, { MEASURE_OPTIONS, type Measure, type ReportRow } from '../ReportTable'
import { CfoPage, Segmented, YearPicker } from '../ui'
import { VOCAB } from '@/lib/cfo/mode'

const FAMILY_PNL_LABEL: Record<string, string> = { 'g:revenue': 'Доходы', 'g:opex': 'Расходы', 'g:finance': 'Прочее', 'g:tax': 'Налоги', 't:net': 'Сбережено' }
import ExportButton from '../ExportButton'
import { downloadWorkbook, reportSheets } from '@/lib/cfo/exportXlsx'

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

  const family = ws.mode === 'family'
  const v = VOCAB[family ? 'family' : 'business']
  // В семейном режиме промежуточные бизнес-итоги (валовая и операционная прибыль) не нужны.
  const rows: ReportRow[] = useMemo(() => buildPnl({ articles: ws.articles, operations: ws.operations, plan: ws.plan, months })
    .filter((r) => !family || (r.key !== 't:gross' && r.key !== 't:operating'))
    .map((r) => ({
    key: r.key,
    label: family ? (FAMILY_PNL_LABEL[r.key] ?? r.label) : r.label,
    level: r.type === 'article' ? 1 : 0,
    strong: r.type !== 'article',
    toggleKey: r.type === 'group' ? r.key : undefined,
    parentKey: r.type === 'article' && r.group ? `g:${r.group}` : undefined,
    cells: r.cells,
    total: r.total,
    higherIsBetter: higherIsBetter(r),
  })), [ws, months, family])

  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <CfoPage title={v.pnl} actions={<><ExportButton onExport={() => downloadWorkbook(`${v.pnl} ${year} — ${ws.companyName}.xlsx`, reportSheets(months, rows))} /><Segmented label="Показатель" value={measure} onChange={setMeasure} options={MEASURE_OPTIONS} /><YearPicker value={year} onChange={setYear} /></>}>
      <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        {v.pnlHint}
      </p>
      <ReportTable months={months} rows={rows} measure={measure} collapsed={collapsed} onToggle={toggle} currentMonth={monthKey(todayIso())} />
    </CfoPage>
  )
}
