'use client'
import { shortMonth } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import { MEASURE_OPTIONS, elapsedMonths, isFutureMonth, measureValue, totalCell, totalHeading, type Measure, type ReportCell } from '@/lib/cfo/reportView'

export { MEASURE_OPTIONS, type Measure }

export type ReportRow = {
  key: string
  label: string
  level: 0 | 1 | 2
  strong: boolean
  toggleKey?: string
  parentKey?: string
  cells: Record<string, ReportCell>
  total: ReportCell
  higherIsBetter: boolean
}

// Что показывать в клетке, решает reportView (те же правила, что в Excel):
// будущий месяц без факта — «—», план будущего месяца виден.
function Value({ cell, measure, higherIsBetter, future }: { cell: ReportCell | undefined; measure: Measure; higherIsBetter: boolean; future: boolean }) {
  const v = measureValue(cell, measure, future)
  if (v === null) return <span style={{ color: 'var(--nav-text-muted)' }}>—</span>
  if (measure === 'fact') return <span style={{ color: v < 0 ? 'var(--nav-critical)' : undefined }}>{formatTenge(v)}</span>
  if (measure === 'plan') return <span>{formatTenge(v)}</span>
  if (v === 0) return <span style={{ color: 'var(--nav-text-muted)' }}>0</span>
  const good = higherIsBetter ? v > 0 : v < 0
  const plan = cell?.plan ?? 0
  const pct = plan !== 0 ? Math.round((v / Math.abs(plan)) * 100) : null
  return (
    <span style={{ color: good ? 'var(--nav-success)' : 'var(--nav-critical)' }}>
      {v > 0 ? '+' : ''}{formatTenge(v)}
      {pct !== null && <span className="block text-[11px] opacity-80">{pct > 0 ? '+' : ''}{pct}%</span>}
    </span>
  )
}

export default function ReportTable({ months, rows, measure, collapsed, onToggle, currentMonth }: {
  months: string[]
  rows: ReportRow[]
  measure: Measure
  collapsed: Set<string>
  onToggle: (key: string) => void
  currentMonth: string
}) {
  const visible = rows.filter((r) => !r.parentKey || !collapsed.has(r.parentKey))
  const noneElapsed = elapsedMonths(months, currentMonth).length === 0
  return (
    <div className="nav-glass rounded-2xl overflow-x-auto">
      <table className="text-sm border-collapse min-w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--nav-border)' }}>
            <th scope="col" className="sticky left-0 z-10 text-left font-semibold px-3 py-2 min-w-[240px]" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>Статья</th>
            {months.map((m) => <th scope="col" key={m} className="px-3 py-2 font-semibold text-right whitespace-nowrap" style={{ color: 'var(--nav-text-secondary)' }}>{shortMonth(m)}</th>)}
            <th scope="col" className="px-3 py-2 font-semibold text-right whitespace-nowrap" style={{ color: 'var(--nav-text-secondary)' }}>{totalHeading(months, currentMonth, measure)}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.key} style={{ borderBottom: '1px solid var(--nav-border-soft)', background: r.strong && r.level === 0 ? 'var(--nav-surface-glass)' : undefined }}>
              <td className="sticky left-0 z-10 px-3 py-2" style={{ background: 'var(--nav-bg)', paddingLeft: `${12 + r.level * 16}px` }}>
                {r.toggleKey ? (
                  <button type="button" onClick={() => onToggle(r.toggleKey!)} aria-expanded={!collapsed.has(r.toggleKey)} className="min-h-[44px] text-left" style={{ color: 'var(--nav-text-primary)', fontWeight: r.strong ? 600 : 400 }}>
                    <span aria-hidden="true" className="inline-block w-4">{collapsed.has(r.toggleKey) ? '▸' : '▾'}</span>{r.label}
                  </button>
                ) : (
                  <span style={{ color: r.level === 2 ? 'var(--nav-text-secondary)' : 'var(--nav-text-primary)', fontWeight: r.strong ? 600 : 400 }}>{r.label}</span>
                )}
              </td>
              {months.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ fontWeight: r.strong ? 600 : 400 }}>
                  <Value cell={r.cells[m]} measure={measure} higherIsBetter={r.higherIsBetter} future={isFutureMonth(m, currentMonth)} />
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">
                <Value cell={totalCell(r, months, currentMonth, measure)} measure={measure} higherIsBetter={r.higherIsBetter} future={noneElapsed} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
