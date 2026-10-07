'use client'
import { useMemo, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { setPlanCells } from '@/lib/cfo/data'
import { addMonths, todayIso, yearMonths } from '@/lib/cfo/dates'
import { shortMonth } from '@/lib/cfo/labels'
import { parseAmountInput } from '@/lib/cfo/money'
import type { ArticleKind } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import { CfoPage, YearPicker } from '../ui'

const show = (t: number) => (t === 0 ? '' : (t / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }))

function PlanCell({ value, label, onCommit, strong = false }: { value: number; label: string; onCommit: (tiyn: number) => void; strong?: boolean }) {
  const [text, setText] = useState(show(value))
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = text.trim() === '' ? 0 : parseAmountInput(text)
        if (parsed === null) { setText(show(value)); return }
        if (parsed !== value) onCommit(parsed)
      }}
      className={`w-28 min-h-[44px] rounded-md px-2 text-right text-sm tabular-nums outline-none border border-transparent focus:border-[color:var(--nav-accent)] ${strong ? 'font-semibold' : ''}`}
      style={{ background: 'transparent', color: 'var(--nav-text-primary)' }}
    />
  )
}

export default function CfoPlan() {
  const { ws, reload } = useCfo()
  const { alert, confirm, dialogElement } = useAppDialog()
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)))
  const [resetNonce, setResetNonce] = useState(0)
  const months = yearMonths(year)
  const planMap = useMemo(() => new Map(ws.plan.map((p) => [`${p.articleId}|${p.month}`, p.amount])), [ws.plan])
  const valueOf = (articleId: string, month: string) => planMap.get(`${articleId}|${month}`) ?? 0

  async function commit(cells: { articleId: string; month: string; amount: number }[]) {
    try {
      await setPlanCells(ws, cells)
      await reload()
    } catch (e) {
      // setPlanCells writes several rows — resync with what actually landed, and drop typed drafts
      await reload().catch(() => {})
      setResetNonce((n) => n + 1)
      await alert(e instanceof Error ? e.message : String(e))
    }
  }

  const articlesOf = (kind: ArticleKind) => ws.articles.filter((a) => a.kind === kind && (!a.archived || months.some((m) => valueOf(a.id, m) !== 0)))

  async function copyPrevious(month: string) {
    const prev = addMonths(month, -1)
    if (!(await confirm(`Заменить план за ${shortMonth(month)} ${month.slice(0, 4)} значениями прошлого месяца?`))) return
    await commit(ws.articles.filter((a) => !a.archived).map((a) => ({ articleId: a.id, month, amount: valueOf(a.id, prev) })))
  }

  // Годовая сумма делится поровну, остаток тиынов — в декабрь.
  function distribute(articleId: string, total: number) {
    const base = Math.floor(total / 12)
    const rest = total - base * 12
    void commit(months.map((m, i) => ({ articleId, month: m, amount: base + (i === 11 ? rest : 0) })))
  }

  return (
    <CfoPage title="План" actions={<YearPicker value={year} onChange={setYear} />}>
      <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        Бюджет по статьям на месяц — с ним сравниваются факт в БДР, БДДС и на обзоре. Конкретные будущие платежи по дням заводятся в «Операциях» как плановые.
        Сумма в колонке «Год» делится поровну на 12 месяцев.
      </p>
      <div className="nav-glass rounded-2xl overflow-x-auto">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--nav-border)' }}>
              <th className="sticky left-0 z-10 text-left font-semibold px-3 py-2 min-w-[140px] sm:min-w-[220px]" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>Статья</th>
              {months.map((m) => (
                <th key={m} className="px-1 py-2 font-semibold text-right" style={{ color: 'var(--nav-text-secondary)' }}>
                  <div className="flex items-center justify-end gap-1">
                    <span>{shortMonth(m)}</span>
                    <button type="button" title="Скопировать из прошлого месяца" aria-label={`Скопировать план из прошлого месяца в ${shortMonth(m)}`} onClick={() => void copyPrevious(m)} className="w-11 h-11 rounded-md text-xs hover:bg-[var(--nav-surface-glass)]">⤺</button>
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 font-semibold text-right" style={{ color: 'var(--nav-text-secondary)' }}>Год</th>
            </tr>
          </thead>
          <tbody>
            {(['income', 'expense'] as ArticleKind[]).map((kind) => (
              <PlanGroup key={kind}>
                <tr>
                  <td colSpan={14} className="sticky left-0 px-3 pt-4 pb-1 text-xs font-semibold uppercase" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>
                    {kind === 'income' ? 'Доходы' : 'Расходы'}
                  </td>
                </tr>
                {articlesOf(kind).map((a) => {
                  const total = months.reduce((s, m) => s + valueOf(a.id, m), 0)
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                      <td className="sticky left-0 z-10 px-3 py-1" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }}>{a.name}</td>
                      {months.map((m) => (
                        <td key={m} className="px-1 py-1">
                          <PlanCell key={`${a.id}|${m}|${valueOf(a.id, m)}|${resetNonce}`} label={`${a.name}, ${shortMonth(m)}`} value={valueOf(a.id, m)} onCommit={(v) => void commit([{ articleId: a.id, month: m, amount: v }])} />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <PlanCell key={`${a.id}|year|${total}|${resetNonce}`} label={`${a.name}, год`} value={total} strong onCommit={(v) => distribute(a.id, v)} />
                      </td>
                    </tr>
                  )
                })}
              </PlanGroup>
            ))}
          </tbody>
        </table>
      </div>
      {dialogElement}
    </CfoPage>
  )
}

function PlanGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
