'use client'
import { useMemo, useRef, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { deleteOperation, deleteRecurrence, markPaid } from '@/lib/cfo/data'
import { monthKey, todayIso } from '@/lib/cfo/dates'
import { accountName, dayLabel, DIRECTION_LABEL, opTitle } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import type { CfoOperation, OpStatus } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import OperationForm from '../OperationForm'
import { Badge, Card, CfoPage, EmptyState, GhostButton, Money, PrimaryButton, SectionTitle, Segmented, inputClass, inputStyle } from '../ui'

const signedAmount = (op: CfoOperation) => (op.direction === 'in' ? op.amount : op.direction === 'out' ? -op.amount : 0)

export default function CfoOperations() {
  const { ws, reload } = useCfo()
  const { alert, confirm, dialogElement } = useAppDialog()
  const today = todayIso()
  const [month, setMonth] = useState(monthKey(today))
  const [accountId, setAccountId] = useState('')
  const [articleId, setArticleId] = useState('')
  const [status, setStatus] = useState<OpStatus | 'all'>('all')
  const [editing, setEditing] = useState<CfoOperation | 'new' | null>(null)

  const list = useMemo(() => ws.operations
    .filter((o) => !month || monthKey(o.paidOn) === month)
    .filter((o) => !accountId || o.accountId === accountId || o.toAccountId === accountId)
    .filter((o) => !articleId || o.articleId === articleId)
    .filter((o) => status === 'all' || o.status === status)
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn)), [ws.operations, month, accountId, articleId, status])

  const busy = useRef(false)
  async function run(action: () => Promise<void>) {
    if (busy.current) return // ignore double clicks on row actions while one is in flight
    busy.current = true
    try { await action(); await reload() } catch (e) { await alert(e instanceof Error ? e.message : String(e)) } finally { busy.current = false }
  }

  // reload first, then close: a failed reload must reach the user, not an unmounted form
  const done = async () => {
    try { await reload() } catch (e) { await alert(e instanceof Error ? e.message : String(e)) }
    setEditing(null)
  }

  return (
    <CfoPage title="Операции" actions={editing === null && (
      <>
        <a href="/cfo/import" className="inline-flex items-center min-h-[44px] rounded-xl px-4 text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)]" style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-secondary)' }}>Импорт выписки</a>
        <PrimaryButton type="button" onClick={() => setEditing('new')}>Добавить операцию</PrimaryButton>
      </>
    )}>
      {editing !== null && (
        <Card>
          <SectionTitle>{editing === 'new' ? 'Новая операция' : 'Изменить операцию'}</SectionTitle>
          <OperationForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} onDone={done} onCancel={() => setEditing(null)} />
        </Card>
      )}

      <Card>
        <div className="flex gap-2 flex-wrap items-end">
          <input type="month" aria-label="Месяц" className={`${inputClass} max-w-[180px]`} style={inputStyle} value={month} onChange={(e) => setMonth(e.target.value)} />
          <select aria-label="Счёт" className={`${inputClass} max-w-[200px]`} style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Все счета</option>
            {ws.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select aria-label="Статья" className={`${inputClass} max-w-[240px]`} style={inputStyle} value={articleId} onChange={(e) => setArticleId(e.target.value)}>
            <option value="">Все статьи</option>
            {ws.articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Segmented label="Статус" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Все' }, { value: 'actual', label: 'Факт' }, { value: 'planned', label: 'План' }]} />
        </div>
      </Card>

      {ws.operations.length === 0 && editing === null ? (
        <EmptyState title="Добавьте первую операцию" hint="Приход, расход или перевод между своими счетами — из них сами строятся БДР, БДДС и календарь." />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {list.length === 0 && <p className="p-4 text-sm" style={{ color: 'var(--nav-text-muted)' }}>За этот период операций нет.</p>}
          {list.map((op) => (
            <div key={op.id} className="px-4 py-3 flex items-start gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
              <div className="w-28 flex-shrink-0 text-xs pt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{dayLabel(op.paidOn)}</div>
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{opTitle(op, ws.accounts, ws.articles)}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                  {op.direction !== 'transfer' && `${accountName(op.accountId, ws.accounts)} · `}
                  {[op.counterparty, op.comment].filter(Boolean).join(' · ') || DIRECTION_LABEL[op.direction]}
                  {op.accruedOn !== op.paidOn && ` · начисление ${op.accruedOn}`}
                </div>
              </div>
              <div className="text-right">
                {op.direction === 'transfer'
                  ? <span className="text-sm tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{formatTenge(op.amount)}</span>
                  : <Money value={signedAmount(op)} signed className="text-sm font-semibold" />}
                <div className="mt-1">{op.status === 'planned' ? <Badge tone="plan">План</Badge> : <Badge tone="fact">Факт</Badge>}</div>
              </div>
              <div className="w-full flex gap-1 flex-wrap justify-end">
                {op.status === 'planned' && <GhostButton type="button" onClick={() => void run(() => markPaid(ws, op, today))}>Оплачено</GhostButton>}
                <GhostButton type="button" onClick={() => setEditing(op)}>Изменить</GhostButton>
                <GhostButton
                  type="button"
                  onClick={async () => { if (await confirm('Удалить операцию?')) await run(() => deleteOperation(op.id)) }}
                >
                  Удалить
                </GhostButton>
              </div>
            </div>
          ))}
        </Card>
      )}

      {ws.recurrences.length > 0 && (
        <Card>
          <SectionTitle>Повторяющиеся платежи</SectionTitle>
          {ws.recurrences.map((r) => (
            <div key={r.id} className="py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{opTitle(r, ws.accounts, ws.articles)}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                  {DIRECTION_LABEL[r.direction]} · {formatTenge(r.amount)} · каждое {r.dayOfMonth}-е число с {r.startsOn}{r.endsOn ? ` по ${r.endsOn}` : ''}
                </div>
              </div>
              <GhostButton
                type="button"
                onClick={async () => { if (await confirm('Удалить правило? Уже оплаченные операции останутся.')) await run(() => deleteRecurrence(r.id)) }}
              >
                Удалить
              </GhostButton>
            </div>
          ))}
        </Card>
      )}
      {dialogElement}
    </CfoPage>
  )
}
