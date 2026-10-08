'use client'
import { useMemo, useRef, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { deleteOperation, deleteRecurrence, markPaid, receiptUrl } from '@/lib/cfo/data'
import { addMonths, firstDay, lastDay, monthKey, todayIso } from '@/lib/cfo/dates'
import { expandRecurrences, isVirtual } from '@/lib/cfo/recurrence'
import { accountName, dayLabel, DIRECTION_LABEL, opTitle } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import type { CfoOperation, OpStatus } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import OperationForm from '../OperationForm'
import OpsCalendar from '../OpsCalendar'
import ExportButton from '../ExportButton'
import { downloadWorkbook, operationsSheet } from '@/lib/cfo/exportXlsx'
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
  const [newDate, setNewDate] = useState<string | undefined>(undefined)
  // Вид (календарь или список) запоминаем в этом браузере — мелкое удобство, без него всё работает.
  // Страница рисуется только после загрузки кабинета в браузере, поэтому читать localStorage здесь безопасно.
  const [view, setView] = useState<'calendar' | 'list'>(() => {
    try { return localStorage.getItem('cfo-ops-view') === 'list' ? 'list' : 'calendar' } catch { return 'calendar' }
  })
  const [calMonth, setCalMonth] = useState(monthKey(today))
  const [selected, setSelected] = useState<string | null>(today)

  const switchView = (v: 'calendar' | 'list') => { setView(v); try { localStorage.setItem('cfo-ops-view', v) } catch { /* ignore */ } }

  const matches = (o: Pick<CfoOperation, 'accountId' | 'toAccountId' | 'articleId' | 'status'>) =>
    (!accountId || o.accountId === accountId || o.toAccountId === accountId) &&
    (!articleId || o.articleId === articleId) &&
    (status === 'all' || o.status === status)

  const list = useMemo(() => ws.operations
    .filter((o) => !month || monthKey(o.paidOn) === month)
    .filter(matches)
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn)), // eslint-disable-next-line react-hooks/exhaustive-deps
  [ws.operations, month, accountId, articleId, status])

  // Календарь: свои операции плюс будущие вхождения повторов — чтобы были видны и плановые месяцы.
  const byDate = useMemo(() => {
    const from = firstDay(calMonth)
    const to = lastDay(calMonth)
    const virtual = expandRecurrences(ws.recurrences, ws.operations, today > from ? today : from, to)
    const map = new Map<string, CfoOperation[]>()
    for (const o of [...ws.operations, ...virtual]) {
      if (o.paidOn < from || o.paidOn > to || !matches(o)) continue
      const day = map.get(o.paidOn) ?? []
      day.push(o)
      map.set(o.paidOn, day)
    }
    return map // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.operations, ws.recurrences, calMonth, today, accountId, articleId, status])

  const busy = useRef(false)
  async function run(action: () => Promise<void>) {
    if (busy.current) return // ignore double clicks on row actions while one is in flight
    busy.current = true
    try { await action(); await reload() } catch (e) { await alert(e instanceof Error ? e.message : String(e)) } finally { busy.current = false }
  }

  // Ссылка на чек живёт 5 минут; окно открываем сразу, адрес подставляем после — иначе браузер сочтёт это всплывающим окном.
  async function openReceipt(path: string) {
    const w = window.open('', '_blank')
    try {
      const url = await receiptUrl(path)
      if (w) w.location.href = url
      else window.location.assign(url)
    } catch (e) {
      w?.close()
      await alert(e instanceof Error ? e.message : String(e))
    }
  }

  // reload first, then close: a failed reload must reach the user, not an unmounted form
  const done = async () => {
    try { await reload() } catch (e) { await alert(e instanceof Error ? e.message : String(e)) }
    setEditing(null)
  }

  const row = (op: CfoOperation) => {
    const virtual = isVirtual(op)
    return (
            <div key={op.id} className="px-4 py-3 flex items-start gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
              <div className="order-1 w-28 flex-shrink-0 text-xs pt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{dayLabel(op.paidOn)}</div>
              <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1 sm:min-w-[180px]">
                <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{opTitle(op, ws.accounts, ws.articles)}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                  {op.direction !== 'transfer' && `${accountName(op.accountId, ws.accounts)} · `}
                  {[op.counterparty, op.comment].filter(Boolean).join(' · ') || DIRECTION_LABEL[op.direction]}
                  {op.accruedOn !== op.paidOn && ` · начисление ${op.accruedOn}`}
                </div>
              </div>
              <div className="order-2 ml-auto sm:ml-0 sm:order-3 text-right">
                {op.direction === 'transfer'
                  ? <span className="text-sm tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{formatTenge(op.amount)}</span>
                  : <Money value={signedAmount(op)} signed className="text-sm font-semibold" />}
                <div className="mt-1">{op.status === 'planned' ? <Badge tone="plan">{virtual ? 'Повтор' : 'План'}</Badge> : <Badge tone="fact">Факт</Badge>}</div>
              </div>
              <div className="order-4 w-full flex gap-1 flex-wrap justify-end">
                {op.attachmentPath && <GhostButton type="button" aria-label={`Чек: ${opTitle(op, ws.accounts, ws.articles)}`} onClick={() => void openReceipt(op.attachmentPath!)}>📎 Чек</GhostButton>}
                {op.status === 'planned' && <GhostButton type="button" aria-label={`Оплачено: ${opTitle(op, ws.accounts, ws.articles)}`} onClick={() => void run(() => markPaid(ws, op, today))}>Оплачено</GhostButton>}
                {!virtual && <GhostButton type="button" aria-label={`Изменить: ${opTitle(op, ws.accounts, ws.articles)}`} onClick={() => { setEditing(op); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Изменить</GhostButton>}
                {!virtual && <GhostButton
                  type="button"
                  aria-label={`Удалить: ${opTitle(op, ws.accounts, ws.articles)}`}
                  onClick={async () => { if (await confirm('Удалить операцию?')) await run(() => deleteOperation(op.id, op.attachmentPath)) }}
                >
                  Удалить
                </GhostButton>}
              </div>
            </div>
    )
  }

  return (
    <CfoPage title="Операции" actions={editing === null && (
      <>
        <a href="/cfo/import" className="inline-flex items-center min-h-[44px] rounded-xl px-4 text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)]" style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-secondary)' }}>Импорт выписки</a>
        <ExportButton onExport={() => downloadWorkbook(`Операции ${month} — ${ws.companyName}.xlsx`, { Операции: operationsSheet(list, ws.accounts, ws.articles) })} />
        <PrimaryButton type="button" onClick={() => { setNewDate(undefined); setEditing('new') }}>Добавить операцию</PrimaryButton>
      </>
    )}>
      {editing !== null && (
        <Card>
          <SectionTitle>{editing === 'new' ? 'Новая операция' : 'Изменить операцию'}</SectionTitle>
          <OperationForm key={editing === 'new' ? `new-${newDate ?? ''}` : editing.id} initial={editing === 'new' ? undefined : editing} defaultDate={editing === 'new' ? newDate : undefined} onDone={done} onCancel={() => setEditing(null)} />
        </Card>
      )}

      <Card>
        <div className="flex gap-2 flex-wrap items-end">
          <Segmented label="Вид" value={view} onChange={switchView} options={[{ value: 'calendar', label: 'Календарь' }, { value: 'list', label: 'Список' }]} />
          {view === 'calendar' && (
            <span className="inline-flex items-center gap-1">
              <GhostButton type="button" aria-label="Предыдущий месяц" onClick={() => { setCalMonth((m) => addMonths(m, -1)); setSelected(null) }}>‹</GhostButton>
              <input type="month" aria-label="Месяц календаря" className={`${inputClass} max-w-[180px]`} style={inputStyle} value={calMonth} onChange={(e) => { if (e.target.value) { setCalMonth(e.target.value); setSelected(null) } }} />
              <GhostButton type="button" aria-label="Следующий месяц" onClick={() => { setCalMonth((m) => addMonths(m, 1)); setSelected(null) }}>›</GhostButton>
              {calMonth !== monthKey(today) && <GhostButton type="button" onClick={() => { setCalMonth(monthKey(today)); setSelected(today) }}>Сегодня</GhostButton>}
            </span>
          )}
          {view === 'list' && <input type="month" aria-label="Месяц" className={`${inputClass} max-w-[180px]`} style={inputStyle} value={month} onChange={(e) => setMonth(e.target.value)} />}
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

      {view === 'calendar' && (
        <>
          <OpsCalendar months={[calMonth]} byDate={byDate} today={today} selected={selected} onSelect={setSelected} accounts={ws.accounts} articles={ws.articles} dayPanel={selected ? (
            <Card className="!p-0 overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                <SectionTitle>{dayLabel(selected)}</SectionTitle>
                <PrimaryButton type="button" onClick={() => { setNewDate(selected); setEditing('new'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Добавить на эту дату</PrimaryButton>
              </div>
              {(byDate.get(selected) ?? []).length === 0 && <p className="p-4 text-sm" style={{ color: 'var(--nav-text-muted)' }}>В этот день операций нет.</p>}
              {(byDate.get(selected) ?? []).map(row)}
            </Card>
          ) : null} />
        </>
      )}

      {view === 'list' && (ws.operations.length === 0 && editing === null ? (
        <EmptyState title="Добавьте первую операцию" hint="Приход, расход или перевод между своими счетами — из них сами строятся БДР, БДДС и календарь." />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {list.length === 0 && <p className="p-4 text-sm" style={{ color: 'var(--nav-text-muted)' }}>{accountId || articleId || status !== 'all' ? 'Нет операций по выбранным фильтрам' : 'За этот период операций нет.'}</p>}
          {list.map(row)}
        </Card>
      ))}

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
