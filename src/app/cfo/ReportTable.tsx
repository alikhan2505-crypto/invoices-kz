'use client'
import { shortMonth } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'

export type Measure = 'fact' | 'plan' | 'diff'
export const MEASURE_OPTIONS: { value: Measure; label: string }[] = [
  { value: 'fact', label: 'Факт' },
  { value: 'plan', label: 'План' },
  { value: 'diff', label: 'Отклонение' },
]

export type ReportRow = {
  key: string
  label: string
  level: 0 | 1 | 2
  strong: boolean
  toggleKey?: string
  parentKey?: string
  cells: Record<string, { plan: number | null; fact: number }>
  total: { plan: number | null; fact: number }
  higherIsBetter: boolean
}

// Founder 07.10.2026: a month that hasn't happened yet has no fact — show «—»,
// not «0 ₸». The plan of a future month is real and stays visible.
function Value({ cell, measure, higherIsBetter, future }: { cell: { plan: number | null; fact: number }; measure: Measure; higherIsBetter: boolean; future: boolean }) {
  if (future && measure !== 'plan') return <span style={{ color: 'var(--nav-text-muted)' }}>—</span>
  if (measure === 'fact') return <span style={{ color: cell.fact < 0 ? 'var(--nav-critical)' : undefined }}>{formatTenge(cell.fact)}</span>
  if (cell.plan === null) return <span style={{ color: 'var(--nav-text-muted)' }}>—</span>
  if (measure === 'plan') return <span>{formatTenge(cell.plan)}</span>
  const diff = cell.fact - cell.plan
  if (diff === 0) return <span style={{ color: 'var(--nav-text-muted)' }}>0</span>
  const good = higherIsBetter ? diff > 0 : diff < 0
  const pct = cell.plan !== 0 ? Math.round((diff / Math.abs(cell.plan)) * 100) : null
  return (
    <span style={{ color: good ? 'var(--nav-success)' : 'var(--nav-critical)' }}>
      {diff > 0 ? '+' : ''}{formatTenge(diff)}
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
  const elapsed = months.filter((m) => m <= currentMonth)
  // Deviation in «Итого» compares like with like: only months that have already started,
  // otherwise mid-year the year-to-date fact is set against the full-year plan.
  const totalCell = (r: ReportRow): ReportRow['total'] => {
    if (measure !== 'diff' || r.total.plan === null) return r.total
    return elapsed.reduce(
      (acc, m) => ({ plan: (acc.plan ?? 0) + (r.cells[m]?.plan ?? 0), fact: acc.fact + (r.cells[m]?.fact ?? 0) }),
      { plan: 0 as number | null, fact: 0 },
    )
  }
  return (
    <div className="nav-glass rounded-2xl overflow-x-auto">
      <table className="text-sm border-collapse min-w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--nav-border)' }}>
            <th scope="col" className="sticky left-0 z-10 text-left font-semibold px-3 py-2 min-w-[240px]" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>Статья</th>
            {months.map((m) => <th scope="col" key={m} className="px-3 py-2 font-semibold text-right whitespace-nowrap" style={{ color: 'var(--nav-text-secondary)' }}>{shortMonth(m)}</th>)}
            <th scope="col" className="px-3 py-2 font-semibold text-right whitespace-nowrap" style={{ color: 'var(--nav-text-secondary)' }}>{measure === 'diff' && elapsed.length > 0 && elapsed.length < months.length ? 'Итого с начала года' : 'Итого'}</th>
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
                  <Value cell={r.cells[m]} measure={measure} higherIsBetter={r.higherIsBetter} future={m > currentMonth} />
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">
                <Value cell={totalCell(r)} measure={measure} higherIsBetter={r.higherIsBetter} future={elapsed.length === 0} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
