'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppDialog } from '@/components/AppDialog'
import { importOperations } from '@/lib/cfo/data'
import { todayIso } from '@/lib/cfo/dates'
import { dayLabel } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import { readStatementGrid } from '@/lib/cfo/readStatement'
import {
  NO_COLUMN, detectColumns, extractRows, markDuplicates, rowProblem, suggestChoice, toDraft,
  type Choice, type ColumnMap, type Grid, type ImportDraft, type ParsedRow,
} from '@/lib/cfo/statementImport'
import { validateOperation } from '@/lib/cfo/validate'
import { useCfo } from '../CfoWorkspace'
import { Badge, Card, CfoPage, ErrorText, Field, GhostButton, Money, PrimaryButton, SectionTitle, inputClass, inputStyle } from '../ui'

const EMPTY_MAP: ColumnMap = { date: NO_COLUMN, amount: NO_COLUMN, debit: NO_COLUMN, credit: NO_COLUMN, counterparty: NO_COLUMN, purpose: NO_COLUMN }
const MAP_FIELDS: { key: keyof ColumnMap; label: string }[] = [
  { key: 'date', label: 'Дата' },
  { key: 'amount', label: 'Сумма со знаком (минус — списание)' },
  { key: 'debit', label: 'Списание (дебет)' },
  { key: 'credit', label: 'Поступление (кредит)' },
  { key: 'counterparty', label: 'Контрагент' },
  { key: 'purpose', label: 'Назначение платежа' },
]

const encode = (c: Choice) => (c.kind === 'article' ? `a:${c.articleId}` : c.kind === 'transfer' ? `t:${c.otherAccountId}` : 'none')
const decode = (v: string): Choice => (v.startsWith('a:') ? { kind: 'article', articleId: v.slice(2) } : v.startsWith('t:') ? { kind: 'transfer', otherAccountId: v.slice(2) } : { kind: 'none' })
const partyKey = (r: ParsedRow) => `${r.direction}|${r.counterparty.trim().toLowerCase()}`
const colName = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `#${i + 1}`)

export default function CfoImport() {
  const { ws, reload, pro } = useCfo()
  const router = useRouter()
  const { alert, confirm, dialogElement } = useAppDialog()
  const today = todayIso()
  const liveAccounts = ws.accounts.filter((a) => !a.archived)

  const [accountId, setAccountId] = useState(liveAccounts[0]?.id ?? '')
  const [fileName, setFileName] = useState('')
  const [grid, setGrid] = useState<Grid | null>(null)
  const [headerRow, setHeaderRow] = useState(0)
  const [map, setMap] = useState<ColumnMap>(EMPTY_MAP)
  const [detected, setDetected] = useState(true)
  const [overrides, setOverrides] = useState<Map<number, Choice>>(new Map())
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const account = ws.accounts.find((a) => a.id === accountId)

  async function onFile(file: File | undefined) {
    setError(null)
    setOverrides(new Map())
    setExcluded(new Set())
    if (!file) return
    try {
      const g = await readStatementGrid(file)
      const d = detectColumns(g)
      setGrid(g)
      setFileName(file.name)
      setDetected(!!d)
      setHeaderRow(d?.headerRow ?? 0)
      setMap(d?.map ?? EMPTY_MAP)
    } catch (e) {
      setGrid(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const mapOk = map.date !== NO_COLUMN && (map.amount !== NO_COLUMN || map.debit !== NO_COLUMN || map.credit !== NO_COLUMN)
  const rows = useMemo(() => (grid && mapOk ? extractRows(grid, headerRow, map) : []), [grid, headerRow, map, mapOk])
  const duplicates = useMemo(() => (account ? markDuplicates(rows, account.id, ws.operations) : new Set<number>()), [rows, account, ws.operations])
  const suggested = useMemo(() => new Map(rows.map((r) => [r.line, suggestChoice(r, ws.operations, ws.articles)])), [rows, ws.operations, ws.articles])

  const choiceOf = (r: ParsedRow) => overrides.get(r.line) ?? suggested.get(r.line) ?? { kind: 'none' as const }
  const problemOf = (r: ParsedRow) => (account ? rowProblem(r, account, today) : 'выберите счёт')
  // По умолчанию берём всё, кроме дублей и строк с проблемой; человек может снять или вернуть галочку.
  const isIncluded = (r: ParsedRow) => !problemOf(r) && (excluded.has(r.line) ? false : !duplicates.has(r.line) || excluded.has(-r.line))

  function setChoice(r: ParsedRow, c: Choice) {
    // Та же статья сразу проставляется всем строкам этого контрагента, которые человек ещё не трогал.
    setOverrides((prev) => {
      const next = new Map(prev)
      next.set(r.line, c)
      if (r.counterparty.trim()) {
        for (const other of rows) if (other.line !== r.line && !prev.has(other.line) && partyKey(other) === partyKey(r)) next.set(other.line, c)
      }
      return next
    })
  }
  function toggle(r: ParsedRow, on: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev)
      next.delete(r.line)
      next.delete(-r.line)
      if (!on) next.add(r.line)
      else if (duplicates.has(r.line)) next.add(-r.line) // дубль, который человек всё же хочет загрузить
      return next
    })
  }

  const chosen = rows.filter(isIncluded)
  const unassigned = chosen.filter((r) => choiceOf(r).kind === 'none')
  const totals = chosen.reduce((t, r) => (r.direction === 'in' ? { ...t, in: t.in + r.amount } : { ...t, out: t.out + r.amount }), { in: 0, out: 0 })

  async function submit() {
    if (!account || saving) return
    setError(null)
    if (chosen.length === 0) { setError('Не выбрано ни одной строки'); return }
    if (unassigned.length > 0) { setError(`Выберите статью для строк: ${unassigned.slice(0, 10).map((r) => r.line).join(', ')}${unassigned.length > 10 ? '…' : ''}`); return }
    const ctx = { accounts: ws.accounts, articles: ws.articles, today }
    const drafts: ImportDraft[] = []
    for (const r of chosen) {
      const d = toDraft(r, account.id, choiceOf(r))
      const problem = d && validateOperation(d, ctx)
      if (!d || problem) { setError(`Строка ${r.line}: ${problem ?? 'выберите статью'}`); return }
      drafts.push(d)
    }
    if (!(await confirm(`Загрузить ${drafts.length} операций на счёт «${account.name}»?`))) return
    setSaving(true)
    try {
      const n = await importOperations(ws, drafts)
      await reload().catch(() => {})
      await alert(`Загружено операций: ${n}`)
      router.push('/cfo/operations')
    } catch (e) {
      await reload().catch(() => {})
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!pro) {
    return (
      <CfoPage title="Импорт выписки">
        <Card className="max-w-xl">
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            Загрузка банковской выписки из Excel доступна на тарифе Про: операции сами ложатся в журнал, статьи подставляются по контрагенту и назначению платежа.
          </p>
          <a href="/upgrade" className="inline-flex items-center min-h-[44px] mt-4 rounded-xl px-4 text-sm font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>Перейти на Про</a>
        </Card>
      </CfoPage>
    )
  }

  const header = grid?.[headerRow] ?? []
  const columnOptions = header.map((h, i) => ({ i, label: `${colName(i)}${String(h ?? '').trim() ? ` — ${String(h).trim().slice(0, 40)}` : ''}` }))
  const otherAccounts = liveAccounts.filter((a) => a.id !== accountId)

  return (
    <CfoPage title="Импорт выписки" actions={<GhostButton type="button" onClick={() => router.push('/cfo/operations')}>К операциям</GhostButton>}>
      <Card>
        <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
          Выгрузите выписку из интернет-банка в Excel и загрузите сюда. Файл читается прямо в браузере и никуда не отправляется — в журнал попадут только строки, которые вы подтвердите.
          Повторная загрузка той же выписки не задвоит операции: совпадения по дате и сумме отмечаются как «уже есть».
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Счёт, по которому выписка">
            <select className={inputClass} style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {liveAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Файл выписки (.xlsx, .xls, .csv)" hint={fileName || undefined}>
            <input type="file" accept=".xlsx,.xls,.csv" className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1 file:text-sm`} style={inputStyle} onChange={(e) => void onFile(e.target.files?.[0])} />
          </Field>
        </div>
        <div className="mt-3"><ErrorText>{!grid ? error : null}</ErrorText></div>
      </Card>

      {grid && (
        <Card>
          <SectionTitle>Колонки</SectionTitle>
          {!detected && (
            <p className="text-sm mb-3" style={{ color: 'var(--nav-critical)' }}>
              Не узнали формат этого банка — укажите строку заголовков и какие колонки что значат.
            </p>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Строка с заголовками">
              <input type="number" min={1} max={grid.length} className={inputClass} style={inputStyle} value={headerRow + 1} onChange={(e) => setHeaderRow(Math.max(0, Math.min(grid.length - 1, Number(e.target.value) - 1 || 0)))} />
            </Field>
            {MAP_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <select className={inputClass} style={inputStyle} value={map[f.key]} onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))}>
                  <option value={NO_COLUMN}>—</option>
                  {columnOptions.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
                </select>
              </Field>
            ))}
          </div>
          {map.amount !== NO_COLUMN && (map.debit !== NO_COLUMN || map.credit !== NO_COLUMN) && (
            <p className="text-xs mt-2" style={{ color: 'var(--nav-text-muted)' }}>Выбрана колонка «Сумма со знаком» — колонки списания и поступления не используются.</p>
          )}
          {!mapOk && <p className="text-sm mt-3" style={{ color: 'var(--nav-critical)' }}>Укажите колонку даты и хотя бы одну колонку суммы.</p>}
        </Card>
      )}

      {grid && mapOk && (
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <SectionTitle>Строки выписки: {rows.length}</SectionTitle>
            <div className="text-sm tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>
              К загрузке {chosen.length}: приход {formatTenge(totals.in)} · расход {formatTenge(totals.out)}
            </div>
          </div>
          {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Не нашли ни одной строки с датой и суммой — проверьте колонки выше.</p>}
          <div>
            {rows.map((r) => {
              const problem = problemOf(r)
              const dup = duplicates.has(r.line)
              const on = isIncluded(r)
              const kind = r.direction === 'in' ? 'income' : 'expense'
              return (
                <div key={r.line} className="py-3 flex items-start gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)', opacity: on ? 1 : 0.55 }}>
                  <label className="flex items-center min-h-[44px] min-w-[44px] justify-center">
                    <input type="checkbox" checked={on} disabled={!!problem} aria-label={`Загрузить строку ${r.line}`} onChange={(e) => toggle(r, e.target.checked)} className="w-5 h-5" />
                  </label>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{dayLabel(r.date)}</span>
                      <Money value={r.direction === 'in' ? r.amount : -r.amount} signed className="text-sm font-semibold" />
                      {dup && <Badge tone="muted">уже есть</Badge>}
                      {problem && <Badge tone="warn">{problem}</Badge>}
                    </div>
                    <div className="text-sm mt-0.5" style={{ color: 'var(--nav-text-primary)' }}>{r.counterparty || '—'}</div>
                    {r.purpose && <div className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--nav-text-muted)' }}>{r.purpose}</div>}
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>строка {r.line} в файле</div>
                  </div>
                  <div className="w-full sm:w-[280px]">
                    <select aria-label={`Статья для строки ${r.line}`} className={inputClass} style={inputStyle} value={encode(choiceOf(r))} disabled={!on} onChange={(e) => setChoice(r, decode(e.target.value))}>
                      <option value="none">— выберите статью —</option>
                      <optgroup label={r.direction === 'in' ? 'Статьи доходов' : 'Статьи расходов'}>
                        {ws.articles.filter((a) => a.kind === kind && !a.archived).map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
                      </optgroup>
                      {otherAccounts.length > 0 && (
                        <optgroup label="Перевод между своими счетами">
                          {otherAccounts.map((a) => <option key={a.id} value={`t:${a.id}`}>{r.direction === 'in' ? `Перевод со счёта «${a.name}»` : `Перевод на счёт «${a.name}»`}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 space-y-2">
            <ErrorText>{error}</ErrorText>
            <PrimaryButton type="button" disabled={saving || chosen.length === 0} onClick={() => void submit()}>
              {saving ? 'Загружаю…' : `Загрузить ${chosen.length} операций`}
            </PrimaryButton>
          </div>
        </Card>
      )}
      {dialogElement}
    </CfoPage>
  )
}
