'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { mightHaveStoredSession } from '@/lib/hasStoredSession'
import { binWatchDict, type BinWatchLang } from '@/lib/i18n/binWatch'
import { authDict } from '@/lib/i18n/auth'
import { canUseBinWatch } from '@/lib/binWatch/config'
import { BIN_WATCH_PAGE_PATH, setPendingBinWatch } from '@/lib/binWatch/pendingIntent'
import { setPostLoginRedirect } from '@/lib/postLoginRedirect'
import { logToolEvent } from '@/lib/tools-i18n/toolEvents'
import { rawFreshFirstSource } from '@/lib/visits/client'
import { TurnstileWidget, type TurnstileHandle } from '@/components/TurnstileWidget'

// Блок «Следить за этим БИН» под результатом проверки контрагента
// (/tools/kontragent на трёх языках и /create). Вошедшему добавляет БИН через
// POST /api/bin-watch. Невошедшему (30.10.2026, решение основателя) показывает
// регистрацию ПРЯМО НА СТРАНИЦЕ: поле email и «Войти через Google», без ухода на /login,
// где терялись все, кто нажал «зарегистрироваться». БИН запоминается (localStorage и
// метаданные письма) и добавляется сам после входа (src/lib/binWatch/applyPending.ts).
//
// Язык приходит пропсом (на публичных страницах он берётся из адреса, а не из
// куки). supabase-js подгружается только если в браузере есть сохранённая сессия
// или человек начал вход: анонимные посетители (почти весь поисковый трафик) его
// не скачивают.

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

interface Viewer {
  ready: boolean
  signedIn: boolean
  isAdmin: boolean
}

function useViewer(): Viewer {
  const [state, setState] = useState<Viewer>({ ready: false, signedIn: false, isAdmin: false })
  useEffect(() => {
    let cancelled = false
    if (!mightHaveStoredSession()) { setState({ ready: true, signedIn: false, isAdmin: false }); return }
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { setState({ ready: true, signedIn: false, isAdmin: false }); return }
        let isAdmin = false
        try {
          // Своя строка: RLS разрешает. Любая ошибка = не админ (кнопка скрыта, гейт закрыт).
          const { data } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle()
          isAdmin = data?.is_admin === true
        } catch { isAdmin = false }
        if (!cancelled) setState({ ready: true, signedIn: true, isAdmin })
      } catch {
        if (!cancelled) setState({ ready: true, signedIn: false, isAdmin: false })
      }
    })()
    return () => { cancelled = true }
  }, [])
  return state
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'adding' }
  | { kind: 'added' }
  | { kind: 'already' }
  | { kind: 'error'; message: string }

export default function BinWatchButton({ bin, lang, onSignInClick, className }: {
  bin: string
  lang: BinWatchLang
  /** Вызывается, когда невошедший начинает вход (на публичных страницах: запомнить язык страницы, аналитика). */
  onSignInClick?: () => void
  className?: string
}) {
  const t = binWatchDict[lang]
  const a = authDict[lang]
  const viewer = useViewer()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  // Регистрация на месте (невошедший).
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [signInError, setSignInError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaRef = useRef<TurnstileHandle>(null)

  // Другой БИН - другая кнопка.
  useEffect(() => { setPhase({ kind: 'idle' }); setSentTo(null); setSignInError(null) }, [bin])

  const add = useCallback(async () => {
    setPhase({ kind: 'adding' })
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/bin-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ bin }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setPhase({ kind: data?.status === 'already' ? 'already' : 'added' }); return }
      if (data?.error === 'limit') { setPhase({ kind: 'error', message: t.limitReached(Number(data?.limit) || 0) }); return }
      if (data?.error === 'not_ready') { setPhase({ kind: 'error', message: t.errNotReady }); return }
      setPhase({ kind: 'error', message: t.errGeneric })
    } catch {
      setPhase({ kind: 'error', message: t.errNetwork })
    }
  }, [bin, t])

  if (!viewer.ready || !/^\d{12}$/.test(bin)) return null
  if (!canUseBinWatch(viewer.isAdmin)) return null

  // БИН и возврат запоминаем ДО отправки письма или ухода в Google: после входа /auth/callback
  // сам добавит БИН (и откроет список, если человек уже был зарегистрирован).
  const rememberIntent = () => {
    onSignInClick?.()
    setPendingBinWatch(bin)
    setPostLoginRedirect(BIN_WATCH_PAGE_PATH)
  }

  async function sendLink() {
    const mail = email.trim()
    if (!mail || !mail.includes('@')) { setSignInError(a.invalidEmailError); return }
    logToolEvent('login_email_press', 'none', { lang })
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      logToolEvent('login_captcha_missing', 'none', { lang })
      setSignInError(a.captchaRequiredError)
      return
    }
    setSending(true)
    setSignInError(null)
    try {
      // Тот же порядок, что на /login: адрес, на который письмо заведомо не дойдёт, не принимаем молча.
      try {
        const res = await fetch('/api/email/deliverable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: mail }),
        })
        const { verdict } = await res.json()
        if (verdict === 'undeliverable') {
          logToolEvent('login_send_error', 'none', { lang })
          setSignInError(a.undeliverableEmailAlert)
          return
        }
      } catch {
        // Сбой проверки никогда не закрывает вход.
      }
      rememberIntent()
      const { supabase } = await import('@/lib/supabase')
      // Письмо часто открывают в другом браузере (из встроенного браузера Instagram в почту):
      // БИН, реферальный код и источник едут в метаданных пользователя, как на /login.
      let refCode = ''
      try { refCode = localStorage.getItem('referral_code') || '' } catch {}
      const firstSource = rawFreshFirstSource()
      const otpData: Record<string, string> = { pending_bin_watch: bin }
      if (refCode) otpData.referral_code = refCode
      if (firstSource) otpData.first_source = firstSource
      const { error } = await supabase.auth.signInWithOtp({
        email: mail,
        options: {
          emailRedirectTo: 'https://invoices.kz/auth/callback',
          data: otpData,
          ...(TURNSTILE_SITE_KEY && captchaToken ? { captchaToken } : {}),
        },
      })
      // Токен капчи одноразовый: следующая отправка берёт новый.
      if (TURNSTILE_SITE_KEY) captchaRef.current?.reset()
      if (error) {
        logToolEvent('login_send_error', 'none', { lang })
        setSignInError(a.errorPrefix(error.message === 'Invalid email' ? a.invalidEmailMessage : error.message))
        return
      }
      logToolEvent('login_link_sent', 'none', { lang })
      setSentTo(mail)
    } finally {
      setSending(false)
    }
  }

  async function signInWithGoogle() {
    logToolEvent('login_google', 'none', { lang })
    rememberIntent()
    const { supabase } = await import('@/lib/supabase')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://invoices.kz/auth/callback' },
    })
  }

  const done = phase.kind === 'added' || phase.kind === 'already'
  const anonymous = !viewer.signedIn
  return (
    <div className={className} data-bin-watch>
     {/* Карточка с заголовком-обещанием (30.10.2026, решение основателя): повод
         зарегистрироваться после проверки, а не серая кнопка без причины. */}
     <div className="rounded-xl p-4" style={{ background: 'var(--nav-accent-soft)', border: '1px solid var(--nav-border)' }}>
      {!done && !sentTo && (
        <div className="text-[13px] font-semibold mb-2.5" style={{ color: 'var(--nav-text-primary)' }}>{t.cardTitle}</div>
      )}

      {anonymous && sentTo ? (
        <div role="status" aria-live="polite">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--nav-success)' }}>{a.checkEmailTitle}</div>
          <p className="text-[12px] mt-1" style={{ color: 'var(--nav-text-primary)' }}>{a.linkSentPrefix} {sentTo}</p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--nav-text-secondary)' }}>{t.inlineAfterOpen}</p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--nav-text-secondary)' }}>{a.spamHint}</p>
          <button type="button" onClick={() => setSentTo(null)}
            className="text-[12px] font-semibold mt-2 min-h-11 px-1" style={{ color: 'var(--nav-accent)' }}>
            {a.changeEmailButton}
          </button>
        </div>
      ) : anonymous ? (
        <>
          <form onSubmit={e => { e.preventDefault(); void sendLink() }} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="bin-watch-email" className="sr-only">{a.emailLabel}</label>
            <input
              id="bin-watch-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={e => { setEmail(e.target.value); if (signInError) setSignInError(null) }}
              placeholder={a.emailPlaceholder}
              className="flex-1 min-w-0 rounded-xl px-3 min-h-11 text-[14px] outline-none"
              style={{ background: 'var(--nav-surface-elevated)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }}
            />
            <button
              type="submit"
              disabled={sending}
              className="rounded-xl px-4 py-2.5 text-[13px] font-semibold min-h-11 transition-colors disabled:opacity-60"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
            >
              {sending ? a.sendingButton : t.inlineSubmit}
            </button>
          </form>
          <button type="button" onClick={() => void signInWithGoogle()}
            className="text-[12px] font-semibold mt-1 min-h-11 px-1" style={{ color: 'var(--nav-accent)' }}>
            {a.googleSignInButton}
          </button>
          {signInError && (
            <div className="text-[12px] mt-1" style={{ color: 'var(--nav-critical)' }} role="alert">{signInError}</div>
          )}
          <div className="text-[12px] mt-1" style={{ color: 'var(--nav-text-secondary)' }}>{t.buttonSignInHint}</div>
          {TURNSTILE_SITE_KEY && <TurnstileWidget ref={captchaRef} siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} />}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {done ? (
              <>
                <span className="text-[13px] font-semibold" style={{ color: 'var(--nav-success)' }} role="status">
                  {phase.kind === 'already' ? t.buttonAlready : t.buttonAdded}
                </span>
                <Link href={BIN_WATCH_PAGE_PATH} className="text-[13px] font-semibold" style={{ color: 'var(--nav-accent)' }}>
                  {t.openList}
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={add}
                disabled={phase.kind === 'adding'}
                className="rounded-xl px-4 py-2.5 text-[13px] font-semibold min-h-11 transition-colors disabled:opacity-60"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                {phase.kind === 'adding' ? t.buttonAdding : t.button}
              </button>
            )}
          </div>
          {!done && (
            <div className="text-[12px] mt-2" style={{ color: 'var(--nav-text-secondary)' }}>{t.buttonHint}</div>
          )}
          <div aria-live="polite">
            {phase.kind === 'error' && (
              <div className="text-[12px] mt-1.5" style={{ color: 'var(--nav-critical)' }} role="alert">{phase.message}</div>
            )}
          </div>
        </>
      )}
     </div>
    </div>
  )
}
