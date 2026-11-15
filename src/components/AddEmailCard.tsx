'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { accountEmailDict } from '@/lib/i18n/accountEmail'
import { isPlaceholderEmail } from '@/lib/whatsappLogin/placeholderEmail'

// Карточка на дашборде для человека, вошедшего по WhatsApp (служебный адрес wa.invalid): ввести почту, получить код,
// подтвердить. Для всех остальных не рисуется. «Позже» прячет карточку на эту вкладку (sessionStorage), потом она вернётся.

const DISMISS_KEY = 'ikz-add-email-dismissed'

type Step = 'email' | 'code'

export default function AddEmailCard() {
  const { lang } = useLanguage()
  const t = accountEmailDict[lang]
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => {
      if (!alive || !isPlaceholderEmail(data.user?.email)) return
      let dismissed = false
      try { dismissed = sessionStorage.getItem(DISMISS_KEY) === '1' } catch {}
      if (!dismissed) setVisible(true)
    })
    return () => { alive = false }
  }, [])

  if (!visible) return null

  async function authHeader(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }
  }

  const startErrors: Record<string, string> = {
    invalid_email: t.errInvalid, undeliverable: t.errUndeliverable, rate_limited: t.errRateLimited,
  }
  const verifyErrors: Record<string, string> = {
    wrong_code: t.errWrongCode, expired: t.errExpired, too_many: t.errTooMany, has_data: t.errHasData,
    other_has_number: t.errOtherHasNumber, rate_limited: t.errRateLimited, invalid_input: t.errWrongCode,
  }

  async function sendCode() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/account/email/start', { method: 'POST', headers: await authHeader(), body: JSON.stringify({ email: email.trim() }) })
      const body = await res.json().catch(() => ({}))
      if (res.ok) { setStep('code'); setCode('') } else setError(startErrors[body?.error] ?? t.errGeneric)
    } catch {
      setError(t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  async function confirmCode() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/account/email/verify', { method: 'POST', headers: await authHeader(), body: JSON.stringify({ email: email.trim(), code }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(verifyErrors[body?.error] ?? t.errGeneric); return }
      if (body.mode === 'linked' && typeof body.url === 'string') {
        // Номер переехал в существующий аккаунт: входим в него обычной вход-ссылкой.
        window.location.href = body.url
        return
      }
      // Почта подтверждена: обновляем сессию, чтобы в ней была новая почта.
      await supabase.auth.refreshSession().catch(() => {})
      setDone(true)
      setTimeout(() => setVisible(false), 2500)
    } catch {
      setError(t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  function later() {
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch {}
    setVisible(false)
  }

  const inputStyle = { background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }
  const primaryStyle = { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }

  return (
    <section className="nav-glass rounded-xl px-4 py-4 mb-5" aria-label={t.title}>
      {done ? (
        <p role="status" className="text-sm font-medium" style={{ color: 'var(--nav-success)' }}>{t.done}</p>
      ) : (
        <>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.title}</h2>
          <p className="text-xs mt-1 mb-3 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>{t.hint}</p>

          {step === 'email' ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <label htmlFor="add-email" className="sr-only">{t.emailLabel}</label>
              <input id="add-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendCode()}
                placeholder="name@example.com"
                className="flex-1 rounded-xl px-3 py-3 text-sm outline-none min-h-12" style={inputStyle} />
              <button onClick={sendCode} disabled={busy || !email.includes('@')} className="rounded-xl px-5 py-3 text-sm font-semibold min-h-12 disabled:opacity-60" style={primaryStyle}>
                {busy ? t.sending : t.sendCode}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xs mb-2 break-all" style={{ color: 'var(--nav-text-secondary)' }}>{t.codeSentTo(email.trim())}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <label htmlFor="add-email-code" className="sr-only">{t.codeLabel}</label>
                <input id="add-email-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={e => e.key === 'Enter' && code.length === 6 && confirmCode()}
                  placeholder="000000"
                  className="flex-1 rounded-xl px-3 py-3 text-sm outline-none min-h-12 tracking-[0.3em] text-center" style={inputStyle} />
                <button onClick={confirmCode} disabled={busy || code.length !== 6} className="rounded-xl px-5 py-3 text-sm font-semibold min-h-12 disabled:opacity-60" style={primaryStyle}>
                  {busy ? t.confirming : t.confirm}
                </button>
              </div>
              <button onClick={() => { setStep('email'); setError('') }} className="text-xs mt-2 underline" style={{ color: 'var(--nav-text-secondary)' }}>{t.changeEmail}</button>
            </div>
          )}

          {error && <p role="alert" className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{error}</p>}
          <button onClick={later} className="text-xs mt-3 block" style={{ color: 'var(--nav-text-muted)' }}>{t.later}</button>
        </>
      )}
    </section>
  )
}
