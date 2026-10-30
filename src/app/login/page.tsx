'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { startAuthentication } from '@simplewebauthn/browser'
import { supabase } from '@/lib/supabase'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { authDict } from '@/lib/i18n/auth'
import { pendingUpgradeFromSearch, setPendingUpgrade } from '@/lib/pendingUpgrade'
import { postLoginRedirectFromSearch, setPostLoginRedirect } from '@/lib/postLoginRedirect'
import { resolvePostLoginDestination } from '@/lib/postLoginDestination'
import { SIGNED_OUT_PARAM } from '@/lib/signOut'
import { useAppDialog } from '@/components/AppDialog'
import { rawFreshFirstSource } from '@/lib/visits/client'
import { TurnstileWidget, type TurnstileHandle } from '@/components/TurnstileWidget'
import { logToolEvent } from '@/lib/tools-i18n/toolEvents'

// Капча входа включается, когда задан публичный ключ Turnstile (и в Supabase
// включена Captcha protection): без ключа поведение прежнее.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

// The signed-in user's enabled_products (for homeFor) and tour state (a
// newcomer goes to the dashboard tour first) -- see postLoginDestination.ts.
async function loadOwnProfile(userId?: string) {
  const id = userId ?? (await supabase.auth.getUser()).data.user?.id
  if (!id) return null
  const { data: prof } = await supabase.from('profiles').select('enabled_products, tour_completed_at').eq('id', id).maybeSingle()
  return prof ?? null
}

const SESSION_CHECK_TIMEOUT_MS = 4500

export default function Login() {
  const router = useRouter()
  const { lang, setLang } = useLanguage()
  const t = authDict[lang]
  // Shadows window.alert for this component -- see src/components/AppDialog.tsx.
  const { alert, dialogElement } = useAppDialog()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  // Shown after a manual resend, so pressing the button visibly does
  // something -- otherwise the screen is identical and the user cannot tell
  // whether the second letter was actually sent.
  const [resent, setResent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  // True until we know there is no valid session. An already-signed-in
  // visitor (founder's admin, 15.10.2026: «Попробовать бесплатно» on a free
  // tool) used to get the login form here, sign in again and be thrown to a
  // stale /upgrade intent. Now they are sent straight on and never see the
  // form; everyone else sees a neutral loader for the instant the local
  // session read takes, never a flash of the form followed by a redirect.
  // Starts true on the server too, so SSR and the first client render match.
  const [checkingSession, setCheckingSession] = useState(true)
  // Effects run twice in dev StrictMode; the destination read consumes the
  // stored postLoginRedirect, so it must run once per mount, not be
  // cancelled-and-repeated (the second run would find the intent gone).
  const sessionCheckStarted = useRef(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaRef = useRef<TurnstileHandle>(null)
  // Set as soon as the visitor touches the form (types an email, presses
  // the passkey button). A session check that finishes after the timeout
  // below must not yank them away mid-typing.
  const formTouched = useRef(false)
  // Шаги входа пишем в свою аналитику (tool_events, login_*, 30.10.2026): с 25.10 по
  // ссылкам из директа кнопку регистрации нажали 5 человек, письмо не запросил никто.
  const openLogged = useRef(false)
  useEffect(() => {
    if (checkingSession || openLogged.current) return
    openLogged.current = true
    logToolEvent('login_open', 'none', { lang })
  }, [checkingSession, lang])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) localStorage.setItem('referral_code', ref)
    const next = postLoginRedirectFromSearch(window.location.search)
    if (next) setPostLoginRedirect(next)
    const pending = pendingUpgradeFromSearch(window.location.search)
    if (pending) setPendingUpgrade(pending.plan, pending.period)
    setPasskeySupported(typeof window !== 'undefined' && !!window.PublicKeyCredential)

    // Runs AFTER ?next= / ?plan=&period= above were stored, exactly as for a
    // fresh sign-in, so a signed-in visitor arriving from a product landing
    // (/login?next=/kaspi-shop) or a pricing card still lands where they meant.
    if (sessionCheckStarted.current) return
    sessionCheckStarted.current = true
    // «Выйти» whose sign-out request failed (see src/lib/signOut.ts): the
    // local session may still be there, but the person asked to leave.
    if (params.get(SIGNED_OUT_PARAM)) { setCheckingSession(false); return }
    // getUser() is a network round trip (and getSession() may wait on a
    // token refresh): on a stalled connection the form must still appear, so
    // after SESSION_CHECK_TIMEOUT_MS the loader gives way to the form. A
    // check that completes later still redirects -- unless the visitor has
    // started using the form by then.
    const timer = window.setTimeout(() => setCheckingSession(false), SESSION_CHECK_TIMEOUT_MS)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          // getSession() only reads storage; getUser() asks the server, so a
          // revoked/deleted account doesn't bounce /login -> dashboard ->
          // /login forever. Any failure here shows the form, as before.
          const { data: { user }, error } = await supabase.auth.getUser()
          if (user && !error && !formTouched.current) {
            const destination = await resolvePostLoginDestination(() => loadOwnProfile(user.id))
            if (!formTouched.current) {
              window.clearTimeout(timer)
              router.replace(destination)
              return
            }
          }
        }
      } catch {
        // fall through to the form
      }
      window.clearTimeout(timer)
      setCheckingSession(false)
    })()
  }, [router])

  async function loginWithPasskey() {
    formTouched.current = true
    logToolEvent('login_passkey', 'none', { lang })
    setPasskeyLoading(true)
    try {
      const optRes = await fetch('/api/webauthn/login-options', { method: 'POST' })
      const optJson = await optRes.json()
      if (optJson.error) { alert(t.errorPrefix(optJson.error)); return }

      const authResp = await startAuthentication({ optionsJSON: optJson.options })

      const verifyRes = await fetch('/api/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: optJson.challengeId, response: authResp }),
      })
      const verifyJson = await verifyRes.json()
      if (verifyJson.error) { alert(t.errorPrefix(verifyJson.error)); return }

      const { error } = await supabase.auth.verifyOtp({ token_hash: verifyJson.tokenHash, type: 'email' })
      if (error) { alert(t.errorPrefix(error.message)); return }

      // A passkey login only ever exists for an already-registered,
      // already-onboarded account, so there is no onboarding branch to
      // preserve here. Destination rule (fresh pending upgrade -> fresh
      // postLoginRedirect -> homeFor), shared with /auth/callback: see
      // src/lib/postLoginDestination.ts. It consumes the stored
      // postLoginRedirect exactly once, whichever branch wins.
      router.replace(await resolvePostLoginDestination(() => loadOwnProfile()))
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError') alert(t.errorPrefix(e?.message || String(e)))
    } finally {
      setPasskeyLoading(false)
    }
  }

  async function sendLink({ again = false }: { again?: boolean } = {}) {
    if (!email) { alert(t.emailRequiredError); return }
    if (!email.includes('@')) { alert(t.invalidEmailError); return }
    logToolEvent('login_email_press', 'none', { lang })
    if (TURNSTILE_SITE_KEY && !captchaToken) { logToolEvent('login_captcha_missing', 'none', { lang }); alert(t.captchaRequiredError); return }
    setLoading(true)

    // Asked before sending, because the send itself gives no sign of
    // failure: a suppressed address is dropped silently and the person is
    // left staring at "Проверьте почту!" waiting for a letter that cannot
    // arrive. Four registered accounts were stuck exactly here. A verdict of
    // 'unknown' means the check itself failed and must not block anyone.
    try {
      const res = await fetch('/api/email/deliverable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const { verdict } = await res.json()
      if (verdict === 'undeliverable') {
        logToolEvent('login_send_error', 'none', { lang })
        alert(t.undeliverableEmailAlert)
        setLoading(false)
        return
      }
    } catch {
      // Same rule: a broken check never becomes a second locked door.
    }

    // Реферальный код едет и в метаданных пользователя: ссылку из письма часто
    // открывают в другом браузере (почтовое приложение на телефоне), где
    // localStorage пуст, и бонус молча терялся. /auth/callback читает оттуда.
    let refCode = ''
    try { refCode = localStorage.getItem('referral_code') || '' } catch {}
    // Так же едет и источник первого захода (отчёт «Машина/QR»): иначе
    // регистрация из другого браузера всегда оказывалась бы 'unknown'.
    const firstSource = rawFreshFirstSource()
    const otpData: Record<string, string> = {}
    if (refCode) otpData.referral_code = refCode
    if (firstSource) otpData.first_source = firstSource
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: 'https://invoices.kz/auth/callback',
        ...(Object.keys(otpData).length ? { data: otpData } : {}),
        ...(TURNSTILE_SITE_KEY && captchaToken ? { captchaToken } : {}),
      }
    })
    // Токен капчи одноразовый: следующая отправка (в т.ч. «Отправить ещё раз») берёт новый.
    if (TURNSTILE_SITE_KEY) captchaRef.current?.reset()
    if (error) {
      logToolEvent('login_send_error', 'none', { lang })
      alert(t.errorPrefix(error.message === 'Invalid email' ? t.invalidEmailMessage : error.message))
    } else {
      logToolEvent('login_link_sent', 'none', { lang })
      setSent(true)
      if (again) setResent(true)
    }
    setLoading(false)
  }

  async function signInWithGoogle() {
    logToolEvent('login_google', 'none', { lang })
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://invoices.kz/auth/callback' }
    })
  }

  async function signInWithFacebook() {
    logToolEvent('login_facebook', 'none', { lang })
    await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: 'https://invoices.kz/auth/callback' }
    })
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4" aria-busy="true">
        <div className="w-8 h-8 border-2 border-[#1C2056] border-t-transparent rounded-full animate-spin" />
        {dialogElement}
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm">
        {/* A language switcher here because this page can be arrived at
            directly -- from a bookmark or the sign-in link in an email --
            and until now there was no way to change language once you had. */}
        <div className="flex justify-end mb-3">
          <div className="flex rounded-full p-0.5 bg-gray-100">
            {(['ru', 'kk', 'en'] as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors ${
                  lang === l ? 'bg-[#1C2056] text-white' : 'text-gray-500'
                }`}>
                {l === 'kk' ? 'ҚЗ' : l}
              </button>
            ))}
          </div>
        </div>
        <h1 className="text-2xl font-bold text-[#1C2056] mb-1">INVOICES.KZ</h1>
        <p className="text-gray-500 text-sm mb-8">{t.loginSubtitle}</p>

        {!sent ? (
          <>
            {passkeySupported && (
              <button onClick={loginWithPasskey} disabled={passkeyLoading}
                className="w-full border border-[#1C2056] text-[#1C2056] rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#1C2056]/5 transition mb-3">
                <span className="text-lg">🔐</span>
                {passkeyLoading ? t.sendingButton : t.passkeyLoginButton}
              </button>
            )}
            <button onClick={signInWithGoogle}
              className="w-full border border-gray-200 text-[#1C2056] rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-3 hover:bg-gray-50 transition mb-3">
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 32.8 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.7-3.1-11.3-7.7l-6.5 5C9.6 39.5 16.3 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C40.9 35.4 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/>
              </svg>
              {t.googleSignInButton}
            </button>
            <button onClick={signInWithFacebook}
              className="w-full border border-gray-200 text-[#1C2056] rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-3 hover:bg-gray-50 transition mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#1877F2" d="M24 12c0-6.6-5.4-12-12-12S0 5.4 0 12c0 6 4.4 11 10.1 11.9v-8.4H7.1V12h3v-2.6c0-3 1.8-4.7 4.6-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4C19.6 23 24 18 24 12z"/>
              </svg>
              {t.facebookSignInButton}
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-xs text-gray-400">{t.orEmailDivider}</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            <label className="text-xs text-gray-500 mb-2 block">{t.emailLabel}</label>
            <input
              className="w-full border rounded-lg px-3 py-3 text-sm outline-none focus:border-[#1C2056] mb-3"
              // The card is always white; the global field ink follows the OS
              // dark scheme, which would paint light text on it.
              style={{ backgroundColor: '#fff', color: '#111827', WebkitTextFillColor: '#111827' }}
              placeholder={t.emailPlaceholder}
              type="email"
              value={email}
              onChange={e => { formTouched.current = true; setEmail(e.target.value) }}
              onKeyDown={e => e.key === 'Enter' && sendLink()}
            />
            <button onClick={() => sendLink()} disabled={loading}
              className="w-full bg-[#2DC48D] text-white rounded-xl py-4 font-medium text-sm">
              {loading ? t.sendingButton : t.sendLinkButton}
            </button>
            {/* Everything on this screen says "Войти", but people arrive
                here from a button that says "Начать бесплатно" — and there
                is no separate sign-up anywhere. Someone without an account
                had every reason to think they were in the wrong place. */}
            <p className="text-xs text-gray-400 mt-4 text-center leading-relaxed">{t.noAccountHint}</p>
          </>
        ) : (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <p className="font-medium text-[#1C2056] mb-2">{t.checkEmailTitle}</p>
            <p className="text-sm text-gray-500">{t.linkSentPrefix}<br/><strong>{email}</strong></p>
            {/* Both of these were missing, and between them they are the only
                way out of this screen when the letter does not show up: the
                folder to look in, and a second try. */}
            <p className="text-xs text-gray-400 mt-4">{t.spamHint}</p>
            <button
              onClick={() => sendLink({ again: true })}
              disabled={loading || resent}
              className="text-sm text-[#2DC48D] font-medium mt-4 disabled:text-gray-400">
              {resent ? t.resentNote : (loading ? t.sendingButton : t.resendLinkButton)}
            </button>
            <button onClick={() => { setSent(false); setResent(false) }} className="text-sm text-gray-400 mt-6 block w-full">
              {t.changeEmailButton}
            </button>
          </div>
        )}
        {TURNSTILE_SITE_KEY && <TurnstileWidget ref={captchaRef} siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} />}
      </div>
      {dialogElement}
    </main>
  )
}