'use client'
import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { onlyBinDigits } from '@/lib/tools-i18n/binAutofill'
import { isPersonIin } from '@/lib/personCheck/iin'
import type { PersonCheckResult } from '@/lib/personCheck/run'
import { buildPersonGroups, countPersonRows, personText, type PersonRow, type PersonTone } from '@/lib/personCheck/rows'
import PersonRequestGuide from '@/components/PersonRequestGuide'

// Вкладка «Физлицо · СБ» на /tools/kontragent (макет 30.10.2026). Только русский и
// только админу, пока включён гейт (src/lib/personCheck/config.ts). Результат строит
// чистая функция buildPersonGroups, здесь одна разметка.

const EASE = [0.16, 1, 0.3, 1] as const

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; result: PersonCheckResult }

const TONE_COLOR: Record<PersonTone, string> = {
  ok: 'var(--nav-success)',
  bad: 'var(--nav-critical)',
  info: 'var(--nav-accent)',
  unknown: 'var(--nav-text-muted)',
  manual: 'var(--nav-text-muted)',
}
const TONE_ICON: Record<PersonTone, string> = { ok: '✓', bad: '!', info: 'i', unknown: '?', manual: '' }

/** «1 замечание», «2 замечания», «5 замечаний». */
function remarksWord(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'замечание'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'замечания'
  return 'замечаний'
}

/** Стрелка «проверить вручную»: рисуем сами, символ ↗ в Safari превращается в цветной эмодзи. */
function ManualArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 7.5 7.5 2.5M3.5 2.5h4v4" />
    </svg>
  )
}

function Row({ row }: { row: PersonRow }) {
  const outlined = row.tone === 'manual'
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-t" style={{ borderColor: 'var(--nav-border)' }}>
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5"
        style={outlined
          ? { border: '1.5px solid var(--nav-text-muted)', color: 'var(--nav-text-muted)' }
          : { background: TONE_COLOR[row.tone], color: row.tone === 'info' ? 'var(--nav-accent-ink)' : '#fff' }}
        aria-hidden="true"
      >
        {row.tone === 'manual' ? <ManualArrow /> : TONE_ICON[row.tone]}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>{row.label}</div>
        <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{row.text}</div>
        {row.details.map(d => (
          <div key={d} className="text-[12px] mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>{d}</div>
        ))}
        {row.link && (
          <a href={row.link.href} target="_blank" rel="noopener noreferrer"
            className="inline-block text-[12px] font-semibold mt-0.5 underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
            {row.link.label}
          </a>
        )}
      </div>
    </div>
  )
}

function Chip({ tone, children }: { tone: 'bad' | 'ok' | 'info' | 'other'; children: ReactNode }) {
  const style = tone === 'bad' ? { background: 'color-mix(in srgb, var(--nav-critical) 14%, transparent)', color: 'var(--nav-critical)' }
    : tone === 'ok' ? { background: 'var(--nav-success-soft)', color: 'var(--nav-success)' }
    : tone === 'info' ? { background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }
    : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold" style={style}>{children}</span>
}

export default function PersonCheckPanel() {
  const [iin, setIin] = useState('')
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const valid = isPersonIin(iin)

  const check = async () => {
    if (!valid || outcome.kind === 'loading') return
    setOutcome({ kind: 'loading' })
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/person-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ iin }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 400) { setOutcome({ kind: 'error', message: 'Это не похоже на ИИН человека: проверьте цифры. БИН компании проверяйте на вкладке «Компания или ИП».' }); return }
      if (res.status === 401 || res.status === 403) { setOutcome({ kind: 'error', message: 'Нет доступа: проверка физлиц пока открыта только администратору.' }); return }
      if (!res.ok || !data?.result) { setOutcome({ kind: 'error', message: 'Не получилось проверить, попробуйте ещё раз' }); return }
      setOutcome({ kind: 'done', result: data.result as PersonCheckResult })
    } catch {
      setOutcome({ kind: 'error', message: 'Не получилось проверить — проверьте интернет и попробуйте ещё раз' })
    }
  }

  const groups = useMemo(() => (outcome.kind === 'done' ? buildPersonGroups(outcome.result) : []), [outcome])
  const counts = useMemo(() => countPersonRows(groups), [groups])

  return (
    <>
      <div className="nav-glass rounded-2xl p-5 mb-4">
        <label htmlFor="iin" className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: 'var(--nav-text-muted)' }}>
          ИИН физического лица
        </label>
        <div className="flex gap-2 flex-wrap">
          <input
            id="iin"
            inputMode="numeric"
            autoComplete="off"
            placeholder="12 цифр"
            value={iin}
            onChange={e => setIin(onlyBinDigits(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') check() }}
            className="flex-1 min-w-[200px] rounded-xl px-4 py-3 text-base font-mono tracking-wider outline-none"
            style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }}
          />
          <button
            onClick={check}
            disabled={!valid || outcome.kind === 'loading'}
            className="rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-50 transition-transform hover:-translate-y-0.5"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
          >
            {outcome.kind === 'loading' ? 'Проверяем…' : 'Проверить'}
          </button>
        </div>
        {iin.length === 12 && !valid && (
          <div className="text-[11px] mt-2" style={{ color: 'var(--nav-critical)' }}>Это не похоже на ИИН человека: проверьте цифры (дата рождения и контрольная цифра не сходятся)</div>
        )}
        <div className="text-[12px] mt-3 rounded-xl px-3 py-2.5" style={{ background: 'color-mix(in srgb, var(--nav-warning) 12%, transparent)', color: 'var(--nav-text-secondary)' }}>
          {personText.legal}
        </div>
      </div>

      <div aria-live="polite">
        {outcome.kind === 'error' && (
          <div className="nav-glass rounded-2xl p-4 mb-4 text-sm" style={{ color: 'var(--nav-critical)' }}>{outcome.message}</div>
        )}

        {outcome.kind === 'done' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}
            className="nav-glass rounded-2xl p-5 mb-4">
            <div className="text-base font-bold" style={{ color: 'var(--nav-text-primary)' }}>ИИН {outcome.result.iin}</div>
            {/* Красную и зелёную плашки показываем, только когда есть что сказать: «0 замечаний» над строками «не удалось проверить» читалось бы как «чисто». */}
            <div className="flex gap-2 flex-wrap mt-3 mb-1">
              {counts.bad > 0 && <Chip tone="bad">{counts.bad} {remarksWord(counts.bad)}</Chip>}
              {counts.ok > 0 && <Chip tone="ok">{counts.ok} без замечаний</Chip>}
              {counts.info > 0 && <Chip tone="info">{counts.info} справочно</Chip>}
              <Chip tone="other">{counts.other} вручную или не проверено</Chip>
            </div>
            {counts.bad === 0 && counts.ok === 0 && (
              <div className="text-[13px] font-semibold mt-2" style={{ color: 'var(--nav-text-primary)' }} role="status">
                Проверить не удалось: реестры не ответили. Это не значит, что всё в порядке, повторите позже.
              </div>
            )}
            {groups.map(g => (
              <div key={g.id}>
                <div className="text-[11px] font-bold uppercase tracking-wider mt-4 mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>{g.title}</div>
                {g.rows.map(r => <Row key={r.id} row={r} />)}
              </div>
            ))}
            <div className="rounded-xl p-4 mt-4" style={{ border: '1px dashed var(--nav-border)' }}>
              <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{personText.conviction.title}</div>
              <p className="text-[13px]" style={{ color: 'var(--nav-text-secondary)' }}>{personText.conviction.text}</p>
              <a href={personText.conviction.href} target="_blank" rel="noopener noreferrer"
                className="inline-block text-[12px] font-semibold mt-1.5 underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
                {personText.conviction.link}
              </a>
            </div>
          </motion.div>
        )}
      </div>

      <PersonRequestGuide />
    </>
  )
}
