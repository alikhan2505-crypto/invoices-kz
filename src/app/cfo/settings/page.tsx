'use client'
import { useEffect, useRef, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { articleInUse, reorder, saveAccount, saveArticle, saveCompanyName, setArchived } from '@/lib/cfo/data'
import { ACCOUNT_KIND_LABEL, ARTICLE_KIND_LABEL } from '@/lib/cfo/labels'
import { ACTIVITY_LABEL_BY_MODE, PNL_GROUP_LABEL_BY_MODE, familyPnlGroup, vocab, type CfoMode } from '@/lib/cfo/mode'
import { formatTenge } from '@/lib/cfo/money'
import { validateArticle } from '@/lib/cfo/validate'
import type { Activity, ArticleKind, CfoAccount, CfoArticle, PnlGroup } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import AccountForm from '../AccountForm'
import DigestSettings from '../DigestSettings'
import ModeSwitch from '../ModeSwitch'
import { Card, CfoPage, ErrorText, Field, GhostButton, PrimaryButton, SectionTitle, inputClass, inputStyle } from '../ui'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

// В семейном режиме строка отчёта — просто «Доход» или «Расход» (группировка
// считается в отчёте, в базе остаётся бизнес-группа).
function ArticleForm({ mode, existing, initial, kindLocked = false, onSave, onCancel }: {
  mode: CfoMode
  existing: CfoArticle[]
  initial?: CfoArticle
  kindLocked?: boolean
  onSave: (a: { name: string; kind: ArticleKind; activity: Activity; pnlGroup: PnlGroup | null }) => Promise<string | null>
  onCancel: () => void
}) {
  const v = vocab(mode)
  const family = mode === 'family'
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<ArticleKind>(initial?.kind ?? 'expense')
  const [activity, setActivity] = useState<Activity>(initial?.activity ?? 'operating')
  const [pnl, setPnl] = useState<PnlGroup | 'none'>(initial ? initial.pnlGroup ?? 'none' : 'opex')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const groups = (Object.keys(PNL_GROUP_LABEL_BY_MODE.business) as PnlGroup[])
  // Семья: один пункт «Доход» для статьи дохода, один «Расход» для расхода.
  const familyGroup: PnlGroup = kind === 'income' ? 'revenue' : 'opex'
  const shownPnl = family ? (pnl === 'none' ? 'none' : familyPnlGroup({ kind, pnlGroup: pnl }) ?? 'none') : pnl

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // В семье хранимую группу не меняем, если она уже есть и в отчёте читается так же.
    const group = pnl === 'none' ? null : family && initial?.pnlGroup && familyPnlGroup(initial) === familyGroup && initial.kind === kind ? initial.pnlGroup : family ? familyGroup : pnl
    const draft = { id: initial?.id, name: name.trim(), kind, activity, pnlGroup: group }
    const problem = validateArticle(draft, existing)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError(null)
    const err = await onSave(draft)
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl p-3" style={{ border: '1px solid var(--nav-border)' }}>
      <Field label="Название статьи">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Тип" hint={kindLocked ? 'По статье уже есть операции — тип не меняется' : undefined}>
          <select className={inputClass} style={inputStyle} value={kind} disabled={kindLocked} onChange={(e) => {
            const k = e.target.value as ArticleKind
            setKind(k)
            setPnl(k === 'income' ? 'revenue' : 'opex')
          }}>
            <option value="income">{ARTICLE_KIND_LABEL.income}</option>
            <option value="expense">{ARTICLE_KIND_LABEL.expense}</option>
          </select>
        </Field>
        <Field label={v.activityField}>
          <select className={inputClass} style={inputStyle} value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
            {(Object.keys(ACTIVITY_LABEL_BY_MODE[mode]) as Activity[]).map((a) => <option key={a} value={a}>{ACTIVITY_LABEL_BY_MODE[mode][a]}</option>)}
          </select>
        </Field>
        <Field label={v.pnlField}>
          <select className={inputClass} style={inputStyle} value={shownPnl} onChange={(e) => setPnl(e.target.value as PnlGroup | 'none')}>
            {family
              ? <option value={familyGroup}>{PNL_GROUP_LABEL_BY_MODE.family[familyGroup]}</option>
              : groups.map((g) => <option key={g} value={g}>{PNL_GROUP_LABEL_BY_MODE.business[g]}</option>)}
            <option value="none">{v.pnlNone}</option>
          </select>
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <GhostButton type="button" onClick={onCancel}>Отмена</GhostButton>
        <PrimaryButton type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</PrimaryButton>
      </div>
    </form>
  )
}

export default function CfoSettings() {
  const { ws, reload } = useCfo()
  const { alert, dialogElement } = useAppDialog()
  const mode: CfoMode = ws.mode ?? 'business'
  const v = vocab(mode)
  const [companyName, setCompanyName] = useState(ws.companyName)
  const [editingAccount, setEditingAccount] = useState<string | 'new' | null>(null)
  const [editingArticle, setEditingArticle] = useState<string | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  async function submitCompanyName(e: React.FormEvent) {
    e.preventDefault()
    const name = companyName.trim()
    if (!name) { setNameError(v.nameEmpty); setNameSaved(false); return }
    setNameError(null)
    setNameSaving(true)
    try {
      await saveCompanyName(ws, name)
      await reload()
      setNameSaved(true)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setNameSaved(false), 2000)
    } catch (err) {
      await reload().catch(() => {})
      await alert(errText(err))
    } finally {
      setNameSaving(false)
    }
  }

  async function run(action: () => Promise<void>) {
    try {
      await action()
      await reload()
    } catch (e) {
      // a multi-row write (reorder) may have partially applied — resync before reporting
      await reload().catch(() => {})
      await alert(errText(e))
    }
  }

  // Reorders over the FULL list (archived rows included) so hidden rows keep their
  // place; the item swaps with its nearest visible neighbour in that direction.
  async function move<T extends { id: string; sort: number; archived: boolean }>(table: 'cfo_accounts' | 'cfo_articles', all: T[], id: string, dir: -1 | 1) {
    const full = [...all].sort((a, b) => a.sort - b.sort)
    const from = full.findIndex((x) => x.id === id)
    if (from < 0) return
    let to = from + dir
    while (to >= 0 && to < full.length && !showArchived && full[to].archived) to += dir
    if (to < 0 || to >= full.length) return
    const ids = full.map((x) => x.id)
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    await run(() => reorder(table, ids, full))
  }

  const accounts = ws.accounts.filter((a) => showArchived || !a.archived)
  const articleList = (kind: ArticleKind) => ws.articles.filter((a) => a.kind === kind && (showArchived || !a.archived))
  const groupLabel = (a: CfoArticle) => {
    const g = mode === 'family' ? familyPnlGroup(a) : a.pnlGroup
    return g ? PNL_GROUP_LABEL_BY_MODE[mode][g] : v.pnlNoneShort
  }

  const accountRow = (a: CfoAccount) => (
    <div key={a.id} className="py-3 flex items-start gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium" style={{ color: a.archived ? 'var(--nav-text-muted)' : 'var(--nav-text-primary)' }}>
          {a.name}{a.archived && ' · в архиве'}
        </div>
        <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
          {ACCOUNT_KIND_LABEL[a.kind]} · {a.kind === 'loan' ? 'долг' : 'остаток'} {formatTenge(a.openingBalance)} на {a.openingDate}
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        <GhostButton type="button" className="!px-3 w-11" aria-label={`Выше: ${a.name}`} onClick={() => void move('cfo_accounts', ws.accounts, a.id, -1)}>↑</GhostButton>
        <GhostButton type="button" className="!px-3 w-11" aria-label={`Ниже: ${a.name}`} onClick={() => void move('cfo_accounts', ws.accounts, a.id, 1)}>↓</GhostButton>
        <GhostButton type="button" aria-label={`Изменить: ${a.name}`} onClick={() => setEditingAccount(a.id)}>Изменить</GhostButton>
        <GhostButton type="button" aria-label={`${a.archived ? 'Вернуть' : 'В архив'}: ${a.name}`} onClick={() => void run(() => setArchived('cfo_accounts', a.id, !a.archived))}>
          {a.archived ? 'Вернуть' : 'В архив'}
        </GhostButton>
      </div>
      {editingAccount === a.id && (
        <div className="w-full pt-2">
          <AccountForm
            initial={a}
            accounts={ws.accounts}
            operations={ws.operations}
            submitLabel="Сохранить"
            onCancel={() => setEditingAccount(null)}
            onSave={async (input) => {
              try { await saveAccount(ws, input); setEditingAccount(null); await reload(); return null } catch (e) { return errText(e) }
            }}
          />
        </div>
      )}
    </div>
  )

  const articleRow = (a: CfoArticle) => (
    <div key={a.id} className="py-3 flex items-start gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium" style={{ color: a.archived ? 'var(--nav-text-muted)' : 'var(--nav-text-primary)' }}>
          {a.name}{a.archived && ' · в архиве'}
        </div>
        <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
          {ACTIVITY_LABEL_BY_MODE[mode][a.activity]} · {groupLabel(a)}
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        <GhostButton type="button" className="!px-3 w-11" aria-label={`Выше: ${a.name}`} onClick={() => void move('cfo_articles', ws.articles.filter((x) => x.kind === a.kind), a.id, -1)}>↑</GhostButton>
        <GhostButton type="button" className="!px-3 w-11" aria-label={`Ниже: ${a.name}`} onClick={() => void move('cfo_articles', ws.articles.filter((x) => x.kind === a.kind), a.id, 1)}>↓</GhostButton>
        <GhostButton type="button" aria-label={`Изменить: ${a.name}`} onClick={() => setEditingArticle(a.id)}>Изменить</GhostButton>
        <GhostButton type="button" aria-label={`${a.archived ? 'Вернуть' : 'В архив'}: ${a.name}`} onClick={() => void run(() => setArchived('cfo_articles', a.id, !a.archived))}>
          {a.archived ? 'Вернуть' : 'В архив'}
        </GhostButton>
      </div>
      {editingArticle === a.id && (
        <div className="w-full pt-2">
          <ArticleForm
            mode={mode}
            existing={ws.articles}
            initial={a}
            kindLocked={articleInUse(ws, a.id)}
            onCancel={() => setEditingArticle(null)}
            onSave={async (input) => {
              try { await saveArticle(ws, { ...input, id: a.id }); setEditingArticle(null); await reload(); return null } catch (e) { return errText(e) }
            }}
          />
        </div>
      )}
    </div>
  )

  return (
    <CfoPage
      title="Настройки"
      actions={
        <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--nav-text-secondary)' }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Показывать архив
        </label>
      }
    >
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start">
      <Card>
        <SectionTitle>{v.company}</SectionTitle>
        <ModeSwitch />
        <form className="flex gap-2 flex-wrap items-center" onSubmit={(e) => void submitCompanyName(e)}>
          <input
            className={`${inputClass} flex-1 min-w-[200px]`}
            style={inputStyle}
            value={companyName}
            onChange={(e) => { setCompanyName(e.target.value); setNameError(null) }}
            aria-label={mode === 'family' ? 'Название семейного бюджета' : 'Название компании'}
            placeholder={v.companyField}
            aria-invalid={nameError ? true : undefined}
          />
          <PrimaryButton type="submit" disabled={nameSaving}>{nameSaving ? 'Сохраняю…' : 'Сохранить'}</PrimaryButton>
          {nameSaved && <span role="status" className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Сохранено</span>}
        </form>
        <ErrorText>{nameError}</ErrorText>
      </Card>

      <DigestSettings />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start">
      <Card>
        <div className="flex items-center justify-between gap-2 mb-1">
          <SectionTitle>{mode === 'family' ? 'Карты, наличные и накопления' : 'Счета и кассы'}</SectionTitle>
          {editingAccount !== 'new' && <PrimaryButton type="button" onClick={() => setEditingAccount('new')}>Добавить счёт</PrimaryButton>}
        </div>
        {editingAccount === 'new' && (
          <div className="mb-3">
            <AccountForm
              accounts={ws.accounts}
              operations={ws.operations}
              submitLabel="Добавить"
              onCancel={() => setEditingAccount(null)}
              onSave={async (input) => {
                try { await saveAccount(ws, input); setEditingAccount(null); await reload(); return null } catch (e) { return errText(e) }
              }}
            />
          </div>
        )}
        {accounts.length === 0 && (
          <p className="text-sm py-2" style={{ color: 'var(--nav-text-muted)' }}>
            {ws.accounts.length > 0 ? 'Все счета в архиве — включите «Показывать архив» или добавьте счёт' : 'Счетов пока нет — добавьте первый счёт'}
          </p>
        )}
        {accounts.map(accountRow)}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2 mb-1">
          <SectionTitle>Статьи</SectionTitle>
          {editingArticle !== 'new' && <PrimaryButton type="button" onClick={() => setEditingArticle('new')}>Добавить статью</PrimaryButton>}
        </div>
        {editingArticle === 'new' && (
          <div className="mb-3">
            <ArticleForm
              mode={mode}
              existing={ws.articles}
              onCancel={() => setEditingArticle(null)}
              onSave={async (input) => {
                try { await saveArticle(ws, input); setEditingArticle(null); await reload(); return null } catch (e) { return errText(e) }
              }}
            />
          </div>
        )}
        {(['income', 'expense'] as ArticleKind[]).map((kind) => (
          <div key={kind} className="mt-3">
            <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>
              {kind === 'income' ? 'Доходы' : 'Расходы'}
            </div>
            {articleList(kind).length === 0 && (
              <p className="text-sm py-2" style={{ color: 'var(--nav-text-muted)' }}>
                {ws.articles.some((x) => x.kind === kind)
                  ? `Все статьи ${kind === 'income' ? 'доходов' : 'расходов'} в архиве — включите «Показывать архив» или добавьте статью`
                  : `Статей ${kind === 'income' ? 'доходов' : 'расходов'} пока нет`}
              </p>
            )}
            {articleList(kind).map(articleRow)}
          </div>
        ))}
      </Card>
      </div>
      {dialogElement}
    </CfoPage>
  )
}
