'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { whatsappLinkDict } from '@/lib/i18n/whatsappLink'
import { useAppDialog } from '@/components/AppDialog'

// Блок «Вход через WhatsApp» в разделе «Вход и Face ID»: привязать номер (сообщение «Привязать <код>» на номер входа,
// 6-значный код из ответа вводится здесь) или отвязать. Если вход через WhatsApp не настроен, блока нет.

interface State { enabled: boolean; linked: boolean; phone: string | null; canUnlink: boolean }

export default function WhatsAppLinkCard() {
  const { lang } = useLanguage()
  const t = whatsappLinkDict[lang]
  const { confirm, dialogElement } = useAppDialog()
  const [state, setState] = useState<State | null>(null)
  const [waUrl, setWaUrl] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function authHeader(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }
  }

  async function load() {
    try {
      const res = await fetch('/api/account/whatsapp', { headers: await authHeader() })
      if (res.ok) setState(await res.json())
    } catch { /* блок просто не показываем */ }
  }

  useEffect(() => { void load() }, [])

  if (!state?.enabled) return <>{dialogElement}</>

  const startErrors: Record<string, string> = {
    unavailable: t.errUnavailable, disabled: t.errUnavailable, rate_limited: t.errRateLimited, already_linked: t.errAlreadyLinked,
  }
  const confirmErrors: Record<string, string> = {
    wrong_code: t.errWrongCode, expired: t.errExpired, too_many: t.errTooMany, taken: t.errTaken,
    already_linked: t.errAlreadyLinked, rate_limited: t.errRateLimited, invalid_input: t.errWrongCode,
  }

  async function start() {
    if (busy) return
    setBusy(true); setError(''); setInfo('')
    try {
      const res = await fetch('/api/account/whatsapp/link/start', { method: 'POST', headers: await authHeader() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || typeof body.url !== 'string') { setError(startErrors[body?.error] ?? t.errGeneric); return }
      setWaUrl(body.url)
      setCode('')
      window.open(body.url, '_blank', 'noopener')
    } catch {
      setError(t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  async function confirmCode() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/account/whatsapp/link/confirm', { method: 'POST', headers: await authHeader(), body: JSON.stringify({ code }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(confirmErrors[body?.error] ?? t.errGeneric); return }
      setWaUrl(null); setCode(''); setInfo(t.linkedDone)
      await load()
    } catch {
      setError(t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    if (busy || !(await confirm(t.unlinkConfirm))) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/account/whatsapp', { method: 'DELETE', headers: await authHeader() })
      if (!res.ok) { setError(t.errGeneric); return }
      setInfo(t.unlinkDone)
      await load()
    } catch {
      setError(t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  const inputStyle = { background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }
  const primaryStyle = { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }

  return (
    <section className="nav-glass rounded-xl px-4 py-4 mt-5" aria-label={t.title}>
      {dialogElement}
      <h2 className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.title}</h2>

      {state.linked ? (
        <>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>{t.hintLinked(state.phone ?? '')}</p>
          {state.canUnlink && (
            <button onClick={unlink} disabled={busy} className="text-xs mt-3 underline disabled:opacity-60" style={{ color: 'var(--nav-text-secondary)' }}>{t.unlink}</button>
          )}
        </>
      ) : waUrl ? (
        <div>
          <p className="text-xs mt-1 mb-3 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>
            {t.codeIntro}{' '}
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{t.openWhatsApp}</a>
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="wa-link-code" className="sr-only">{t.codeLabel}</label>
            <input id="wa-link-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && code.length === 6 && confirmCode()}
              placeholder="000000" className="flex-1 rounded-xl px-3 py-3 text-sm outline-none min-h-12 tracking-[0.3em] text-center" style={inputStyle} />
            <button onClick={confirmCode} disabled={busy || code.length !== 6} className="rounded-xl px-5 py-3 text-sm font-semibold min-h-12 disabled:opacity-60" style={primaryStyle}>
              {busy ? t.confirming : t.confirm}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs mt-1 mb-3 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>{t.hintUnlinked}</p>
          <button onClick={start} disabled={busy} className="rounded-xl px-5 py-3 text-sm font-semibold min-h-12 disabled:opacity-60" style={primaryStyle}>
            {busy ? t.linking : t.link}
          </button>
        </>
      )}

      {info && <p role="status" className="text-xs mt-2" style={{ color: 'var(--nav-success)' }}>{info}</p>}
      {error && <p role="alert" className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{error}</p>}
    </section>
  )
}
