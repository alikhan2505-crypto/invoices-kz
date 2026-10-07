'use client'
import { useState } from 'react'
import type { CfoOperation, Direction, OpStatus } from '@/lib/cfo/types'
import { saveOperation, saveRecurrence } from '@/lib/cfo/data'
import { parseAmountInput, tiynToNumber } from '@/lib/cfo/money'
import { todayIso } from '@/lib/cfo/dates'
import { validateOperation, validateRecurrence } from '@/lib/cfo/validate'
import { useCfo } from './CfoWorkspace'
import { ErrorText, Field, GhostButton, PrimaryButton, Segmented, inputClass, inputStyle } from './ui'

export default function OperationForm({ initial, onDone, onCancel }: { initial?: CfoOperation; onDone: () => Promise<void>; onCancel: () => void }) {
  const { ws } = useCfo()
  const today = todayIso()
  const accounts = ws.accounts.filter((a) => !a.archived || a.id === initial?.accountId || a.id === initial?.toAccountId)

  const [direction, setDirection] = useState<Direction>(initial?.direction ?? 'out')
  const [amount, setAmount] = useState(initial ? String(tiynToNumber(initial.amount)) : '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? '')
  const [articleId, setArticleId] = useState(initial?.articleId ?? '')
  const [paidOn, setPaidOn] = useState(initial?.paidOn ?? today)
  const [separateAccrual, setSeparateAccrual] = useState(!!initial && initial.accruedOn !== initial.paidOn)
  const [accruedOn, setAccruedOn] = useState(initial?.accruedOn ?? today)
  const [status, setStatus] = useState<OpStatus>(initial?.status ?? 'actual')
  const [counterparty, setCounterparty] = useState(initial?.counterparty ?? '')
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [repeat, setRepeat] = useState(false)
  const [endsOn, setEndsOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const articleKind = direction === 'in' ? 'income' : 'expense'
  const articles = ws.articles.filter((a) => a.kind === articleKind && (!a.archived || a.id === initial?.articleId))

  function changeDirection(d: Direction) {
    setDirection(d)
    const kind = d === 'in' ? 'income' : 'expense'
    if (!ws.articles.some((a) => a.id === articleId && a.kind === kind)) setArticleId('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const tiyn = parseAmountInput(amount)
    if (tiyn === null) { setError('Сумма — число, например 150000 или 1 250,50'); return }
    const ctx = { accounts: ws.accounts, articles: ws.articles, today }
    const toAccount = direction === 'transfer' ? toAccountId || null : null
    const article = direction === 'transfer' ? null : articleId || null
    const extra = { counterparty: counterparty.trim() || null, comment: comment.trim() || null }

    setSaving(true)
    setError(null)
    try {
      if (repeat) {
        const rule = { direction, amount: tiyn, accountId, toAccountId: toAccount, articleId: article, dayOfMonth: Number(paidOn.slice(8, 10)), startsOn: paidOn, endsOn: endsOn || null }
        const v = validateRecurrence(rule, ctx)
        if (v) { setError(v); return }
        await saveRecurrence(ws, { ...rule, ...extra })
      } else {
        const draft = { direction, amount: tiyn, accountId, toAccountId: toAccount, articleId: article, paidOn, accruedOn: separateAccrual && direction !== 'transfer' ? accruedOn : paidOn, status }
        const v = validateOperation(draft, ctx)
        if (v) { setError(v); return }
        await saveOperation(ws, { ...draft, ...extra, id: initial?.id })
      }
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Segmented
          label="Тип операции"
          value={direction}
          onChange={changeDirection}
          options={[{ value: 'out', label: 'Расход' }, { value: 'in', label: 'Приход' }, { value: 'transfer', label: 'Перевод' }]}
        />
        <Segmented
          label="Статус"
          value={status}
          onChange={(s) => { setStatus(s); if (s === 'actual') setRepeat(false) }}
          options={[{ value: 'actual', label: 'Факт' }, { value: 'planned', label: 'План' }]}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Сумма, ₸">
          <input className={inputClass} style={inputStyle} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label={direction === 'transfer' ? 'Со счёта' : 'Счёт'}>
          <select className={inputClass} style={inputStyle} value={accountId} onChange={(e) => { setAccountId(e.target.value); if (e.target.value === toAccountId) setToAccountId('') }}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {direction === 'transfer' ? (
          <Field label="На счёт">
            <select className={inputClass} style={inputStyle} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Выберите счёт</option>
              {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Статья">
            <select className={inputClass} style={inputStyle} value={articleId} onChange={(e) => setArticleId(e.target.value)}>
              <option value="">Выберите статью</option>
              {articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={repeat ? 'Первый платёж' : 'Дата оплаты'}>
          <input type="date" className={inputClass} style={inputStyle} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>

      {direction !== 'transfer' && !repeat && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--nav-text-secondary)' }}>
            <input type="checkbox" checked={separateAccrual} onChange={(e) => setSeparateAccrual(e.target.checked)} />
            Другая дата начисления (для БДР)
          </label>
          {separateAccrual && (
            <Field label="Дата начисления" hint="Например, услуга за март, оплаченная в апреле: начисление — март">
              <input type="date" className={inputClass} style={inputStyle} value={accruedOn} onChange={(e) => setAccruedOn(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Контрагент">
          <input className={inputClass} style={inputStyle} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        </Field>
        <Field label="Комментарий">
          <input className={inputClass} style={inputStyle} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>

      {!initial && status === 'planned' && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--nav-text-secondary)' }}>
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            Повторять каждый месяц в этот день
          </label>
          {repeat && (
            <Field label="Повторять до (необязательно)">
              <input type="date" className={inputClass} style={inputStyle} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <GhostButton type="button" onClick={onCancel}>Отмена</GhostButton>
        <PrimaryButton type="submit" disabled={saving}>{saving ? 'Сохраняю…' : initial ? 'Сохранить' : 'Добавить'}</PrimaryButton>
      </div>
    </form>
  )
}
