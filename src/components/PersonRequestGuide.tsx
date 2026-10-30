'use client'
import { useEffect, useState } from 'react'
import { personRequestText as T } from '@/lib/personCheck/requestText'

// «Запросить справки у человека»: проводник без хранения данных (30.10.2026).
// Мы НЕ получаем, не видим и не храним справки: запрос подписывает пользователь на
// egov.kz, человек подтверждает его сам. Здесь только подсказки, копирование ИИН в
// буфер обмена (ИИН никуда не уходит: ни на сервер, ни в аналитику) и таймер
// «человек должен ответить». В localStorage лежит только время отправки, без ИИН.
// Что подтверждено, а что нет, и откуда это известно: src/lib/personCheck/requestText.ts.

const STORAGE_KEY = 'person-request-sent-at'

function readSentAt(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && Date.now() - n < T.windowMs * 12 ? n : null
  } catch { return null }
}

function formatClock(ms: number): string {
  // Время в Алматы (UTC+5, единый пояс с 2024 года), чтобы не зависеть от пояса компьютера.
  const d = new Date(ms + 5 * 3_600_000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export default function PersonRequestGuide({ iin, valid }: { iin: string; valid: boolean }) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    // Читаем сохранённое после монтирования: страница статическая, на сервере localStorage нет.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSentAt(readSentAt())
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(iin)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    window.setTimeout(() => setCopied('idle'), 4000)
  }

  const markSent = () => {
    const t = Date.now()
    setSentAt(t)
    setNow(t)
    try { window.localStorage.setItem(STORAGE_KEY, String(t)) } catch { /* без сохранения таймер живёт до закрытия вкладки */ }
  }
  const reset = () => {
    setSentAt(null)
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ничего */ }
  }

  const deadline = sentAt ? sentAt + T.windowMs : null
  const left = deadline ? deadline - now : null
  const muted = { color: 'var(--nav-text-muted)' } as const
  const secondary = { color: 'var(--nav-text-secondary)' } as const

  return (
    <section className="nav-glass rounded-2xl p-5 mb-4" aria-labelledby="person-request-title">
      <h2 id="person-request-title" className="text-base font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{T.title}</h2>
      <p className="text-[13px] mb-4" style={secondary}>{T.lead}</p>

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

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={copy} disabled={!valid}
          className="rounded-xl px-4 py-2.5 min-h-11 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {T.copyButton}
        </button>
        <a href={T.serviceHref} target="_blank" rel="noopener noreferrer"
          className="rounded-xl px-4 py-2.5 min-h-11 inline-flex items-center text-[13px] font-semibold"
          style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-accent)' }}>
          {T.openButton}
        </a>
        <span className="text-[12px]" style={muted} role="status">
          {copied === 'ok' ? T.copied : copied === 'fail' ? T.copyFailed : !valid ? T.needIin : ''}
        </span>
      </div>

      <p className="text-[12px] mt-3" style={secondary}>{T.otherNote}</p>
      <p className="text-[12px] mt-1.5" style={muted}>
        <a href={T.infoHref} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>{T.infoLink}</a>
        {'. '}{T.infoNote}
      </p>

      <div className="mt-4 rounded-xl p-3.5" style={{ border: '1px dashed var(--nav-border)' }}>
        {sentAt === null ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px]" style={secondary}>{T.timerAsk}</span>
            <button type="button" onClick={markSent}
              className="rounded-xl px-3.5 py-2 min-h-11 text-[13px] font-semibold"
              style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }}>{T.timerStart}</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3" role="status">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
              {left !== null && left > 0 ? T.timerLeft(formatClock(deadline as number), Math.ceil(left / 60_000)) : T.timerExpired}
            </span>
            <button type="button" onClick={reset}
              className="text-[12px] font-semibold min-h-11 px-1" style={{ color: 'var(--nav-accent)' }}>{T.timerReset}</button>
          </div>
        )}
      </div>

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
