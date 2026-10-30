'use client'
import { useMemo, useState } from 'react'
import { REQUESTABLE_CERTIFICATES, buildPersonMessage, personRequestText as T } from '@/lib/personCheck/requestText'

// «Справки о человеке» (30.10.2026): проводник без хранения данных. Заказать справку на
// другого человека компания через egov.kz не может (форма предлагает только «на себя», «на
// ребёнка», «на опекаемого»: проверено основателем), поэтому делаем то, что работает: собираем
// сообщение, которое человек получает, заказывает справку у себя и присылает файл. Мы справок не
// получаем, не видим и не храним, ИИН сюда не попадает. Что подтверждено и откуда: requestText.ts.

export default function PersonRequestGuide() {
  const [picked, setPicked] = useState<string[]>([REQUESTABLE_CERTIFICATES[0].id])
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')

  const message = useMemo(
    () => buildPersonMessage(REQUESTABLE_CERTIFICATES.filter(c => picked.includes(c.id))),
    [picked],
  )

  const toggle = (id: string) => {
    setCopied('idle')
    setPicked(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]))
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    window.setTimeout(() => setCopied('idle'), 4000)
  }

  const muted = { color: 'var(--nav-text-muted)' } as const
  const secondary = { color: 'var(--nav-text-secondary)' } as const

  return (
    <section className="nav-glass rounded-2xl p-5 mb-4" aria-labelledby="person-request-title">
      <h2 id="person-request-title" className="text-base font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{T.title}</h2>
      <p className="text-[13px] mb-4" style={secondary}>{T.lead}</p>

      <fieldset className="mb-4">
        <legend className="text-[11px] font-bold uppercase tracking-wider mb-1" style={muted}>{T.certsTitle}</legend>
        <p className="text-[12px] mb-2" style={secondary}>{T.certsLead}</p>
        <div className="space-y-2">
          {REQUESTABLE_CERTIFICATES.map(c => {
            const on = picked.includes(c.id)
            return (
              <label key={c.id} className="flex items-start gap-3 rounded-xl p-3 cursor-pointer min-h-11"
                style={{ border: `1px solid ${on ? 'var(--nav-accent)' : 'var(--nav-border)'}`, background: on ? 'var(--nav-accent-soft)' : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="mt-1 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{c.title}</span>
                  <span className="block text-[12px] mt-0.5" style={secondary}>{c.shows}</span>
                  {on && c.extra && <span className="block text-[12px] mt-1" style={muted}>{c.extra}</span>}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="mb-4">
        <label htmlFor="person-message" className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={muted}>{T.previewTitle}</label>
        <textarea id="person-message" readOnly value={picked.length ? message : ''} rows={8}
          className="w-full rounded-xl p-3 text-[12px] leading-relaxed outline-none resize-y"
          style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }} />
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <button type="button" onClick={copy} disabled={!picked.length}
            className="rounded-xl px-4 py-2.5 min-h-11 text-[13px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            {T.copyMessage}
          </button>
          <span className="text-[12px]" style={muted} role="status">
            {copied === 'ok' ? T.copied : copied === 'fail' ? T.copyFailed : ''}
          </span>
        </div>
      </div>

      <ol className="space-y-3 mb-4">
        {T.steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 mt-0.5"
              style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }} aria-hidden="true">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{s.title}</div>
              <div className="text-[12px] mt-0.5" style={secondary}>{s.text}</div>
            </div>
          </li>
        ))}
      </ol>

      <details className="mb-4">
        <summary className="text-[12px] font-semibold cursor-pointer min-h-11 inline-flex items-center" style={{ color: 'var(--nav-accent)' }}>
          {T.thirdParty.title} <span aria-hidden="true" className="ml-1">+</span>
        </summary>
        <p className="text-[12px] mt-1 mb-1.5" style={secondary}>{T.thirdParty.text}</p>
        <a href={T.thirdParty.href} target="_blank" rel="noopener noreferrer"
          className="inline-block text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>{T.thirdParty.link}</a>
      </details>

      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={muted}>{T.enbek.title}</div>
        <p className="text-[13px] mb-1.5" style={secondary}>{T.enbek.lead}</p>
        <ul className="text-[12px] list-disc pl-5 space-y-0.5 mb-1.5" style={secondary}>
          {T.enbek.fields.map(f => <li key={f}>{f}</li>)}
        </ul>
        <p className="text-[12px] mb-1.5" style={secondary}>{T.enbek.notThere}</p>
        <a href={T.enbek.href} target="_blank" rel="noopener noreferrer"
          className="inline-block text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>{T.enbek.link}</a>
      </div>

      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={muted}>{T.exitBan.title}</div>
        <p className="text-[12px] mb-1.5" style={secondary}>{T.exitBan.text}</p>
        <a href={T.exitBan.href} target="_blank" rel="noopener noreferrer"
          className="inline-block text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>{T.exitBan.link}</a>
      </div>

      <p className="text-[11px] mt-4" style={muted}>{T.legal}</p>
    </section>
  )
}
