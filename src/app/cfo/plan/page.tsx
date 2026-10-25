'use client'
import { Fragment, useMemo, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { setPlanCells } from '@/lib/cfo/data'
import { addMonths, todayIso, yearMonths } from '@/lib/cfo/dates'
import { shortMonth } from '@/lib/cfo/labels'
import { vocab } from '@/lib/cfo/mode'
import { parseAmountInput } from '@/lib/cfo/money'
import { validateAmount } from '@/lib/cfo/validate'
import type { ArticleKind } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import { CfoPage, YearPicker } from '../ui'

const show = (t: number) => (t === 0 ? '' : (t / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }))
const BAD_INPUT = 'Введите сумму, например 150000'

// Проверка до запроса: та же граница и то же русское сообщение, что в форме операции,
// вместо сырого «numeric field overflow» от базы. Текст ошибки уходит наверх
// (onProblem) и показывается под таблицей — title на телефоне не виден.
function PlanCell({ value, label, onCommit, onProblem, strong = false }: { value: number; label: string; onCommit: (tiyn: number) => void; onProblem: (message: string | null) => void; strong?: boolean }) {
  const [text, setText] = useState(show(value))
  const [invalid, setInvalid] = useState<string | null>(null)
  const problem = (message: string | null) => { setInvalid(message); onProblem(message) }
  return (
    <input
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      title={invalid ?? undefined}
      inputMode="decimal"
      value={text}
      onChange={(e) => { setText(e.target.value); problem(null) }}
      onKeyDown={(e) => { if (e.key === 'Escape') { setText(show(value)); problem(null) } }}
      onBlur={() => {
        const parsed = text.trim() === '' ? 0 : parseAmountInput(text)
        if (parsed === null) { problem(BAD_INPUT); return }
        const bad = validateAmount(parsed)
        if (bad) { problem(bad); return }
        problem(null)
        if (parsed !== value) onCommit(parsed)
      }}
      className={`w-28 min-h-[44px] rounded-md px-2 text-right text-sm tabular-nums outline-none border ${invalid ? 'border-[color:var(--nav-critical)]' : 'border-transparent focus:border-[color:var(--nav-accent)]'} ${strong ? 'font-semibold' : ''}`}
      style={{ background: 'transparent', color: invalid ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}
    />
  )
}

export default function CfoPlan() {
  const { ws, reload } = useCfo()
  const { alert, confirm, dialogElement } = useAppDialog()
  const v = vocab(ws.mode)
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)))
  const [resetNonce, setResetNonce] = useState(0)
  const [saving, setSaving] = useState(false)
  // Ячейка → текст ошибки; под таблицей показываем первую.
  const [problems, setProblems] = useState<Record<string, string>>({})
  const reportProblem = (cell: string, message: string | null) => setProblems((p) => {
    if (message === null) { if (!(cell in p)) return p; const rest = { ...p }; delete rest[cell]; return rest }
    return p[cell] === message ? p : { ...p, [cell]: message }
  })
  const firstProblem = Object.entries(problems)[0]
  const months = useMemo(() => yearMonths(year), [year])
  const planMap = useMemo(() => new Map(ws.plan.map((p) => [`${p.articleId}|${p.month}`, p.amount])), [ws.plan])
  const valueOf = (articleId: string, month: string) => planMap.get(`${articleId}|${month}`) ?? 0

  async function commit(cells: { articleId: string; month: string; amount: number }[]) {
    setSaving(true)
    try {
      await setPlanCells(ws, cells)
      await reload()
    } catch (e) {
      // setPlanCells writes several rows — resync with what actually landed, and drop typed drafts
      await reload().catch(() => {})
      setResetNonce((n) => n + 1)
      setProblems({})
      await alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const articlesOf = (kind: ArticleKind) => ws.articles.filter((a) => a.kind === kind && (!a.archived || months.some((m) => valueOf(a.id, m) !== 0)))

  async function copyPrevious(month: string) {
    const prev = addMonths(month, -1)
    if (!(await confirm(`Заменить ${ws.mode === 'family' ? 'бюджет' : 'план'} за ${shortMonth(month)} ${month.slice(0, 4)} значениями прошлого месяца?`))) return
    await commit(ws.articles.filter((a) => !a.archived).map((a) => ({ articleId: a.id, month, amount: valueOf(a.id, prev) })))
  }

  // Годовая сумма делится поровну, остаток тиынов — в декабрь.
  async function distribute(articleId: string, total: number) {
    const overwrites = months.some((m) => valueOf(articleId, m) !== 0)
    if (overwrites) {
      const name = ws.articles.find((a) => a.id === articleId)?.name ?? ''
      if (!(await confirm(`Заменить ${ws.mode === 'family' ? 'бюджет' : 'план'} по статье «${name}» за все 12 месяцев ${year} года равными долями от новой суммы?`))) {
        setResetNonce((n) => n + 1) // drop the typed draft
        return
      }
    }
    const base = Math.floor(total / 12)
    const rest = total - base * 12
    await commit(months.map((m, i) => ({ articleId, month: m, amount: base + (i === 11 ? rest : 0) })))
  }

  return (
    <CfoPage title={v.plan} actions={<>{saving && <span role="status" className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Сохраняю…</span>}<YearPicker value={year} onChange={(y) => { setYear(y); setProblems({}) }} /></>}>
      <p className="text-sm max-w-prose" style={{ color: 'var(--nav-text-secondary)' }}>
        {v.planHint}
        {' '}Сумма в колонке «Год» делится поровну на 12 месяцев.
      </p>
      <div className="nav-glass rounded-2xl overflow-x-auto" aria-busy={saving || undefined} style={saving ? { opacity: 0.7, transition: 'opacity 150ms' } : undefined}>
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--nav-border)' }}>
              <th scope="col" className="sticky left-0 z-10 text-left font-semibold px-3 py-2 min-w-[140px] sm:min-w-[220px]" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>Статья</th>
              {months.map((m) => (
                <th scope="col" key={m} className="px-1 py-2 font-semibold text-right" style={{ color: 'var(--nav-text-secondary)' }}>
                  <div className="flex items-center justify-end gap-1">
                    <span>{shortMonth(m)}</span>
                    <button type="button" disabled={saving} title="Скопировать из прошлого месяца" aria-label={`Скопировать из прошлого месяца в ${shortMonth(m)}`} onClick={() => void copyPrevious(m)} className="w-11 h-11 rounded-md text-xs hover:bg-[var(--nav-surface-glass)] disabled:opacity-50">⤺</button>
                  </div>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-semibold text-right" style={{ color: 'var(--nav-text-secondary)' }}>Год</th>
            </tr>
          </thead>
          <tbody>
            {(['income', 'expense'] as ArticleKind[]).map((kind) => (
              <Fragment key={kind}>
                <tr>
                  <td colSpan={14} className="sticky left-0 z-10 px-3 pt-4 pb-1 text-xs font-semibold uppercase" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>
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
                          <PlanCell key={`${a.id}|${m}|${valueOf(a.id, m)}|${resetNonce}`} label={`${a.name}, ${shortMonth(m)}`} value={valueOf(a.id, m)} onCommit={(v) => void commit([{ articleId: a.id, month: m, amount: v }])} onProblem={(msg) => reportProblem(`${a.name}, ${shortMonth(m)}`, msg)} />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <PlanCell key={`${a.id}|year|${total}|${resetNonce}`} label={`${a.name}, год`} value={total} strong onCommit={(v) => void distribute(a.id, v)} onProblem={(msg) => reportProblem(`${a.name}, год`, msg)} />
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {firstProblem && (
        <p role="alert" className="text-sm" style={{ color: 'var(--nav-critical)' }}>
          {firstProblem[0]}: {firstProblem[1]}
        </p>
      )}
      {dialogElement}
    </CfoPage>
  )
}
