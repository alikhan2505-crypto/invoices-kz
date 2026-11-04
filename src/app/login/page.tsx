'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
import { peekPendingBinWatch } from '@/lib/binWatch/pendingIntent'
import { mailProviderLink, suggestEmailFix } from '@/lib/emailHelpers'

// Капча входа включается, когда задан публичный ключ Turnstile (и в Supabase
// включена Captcha protection): без ключа поведение прежнее.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

// Вход через Facebook (30.10.2026): работает через ОТДЕЛЬНОЕ Meta-приложение 1756376895782349
// (рабочий режим, расширенный доступ к email и public_profile, ключи в Supabase → Providers →
// Facebook). Первое приложение (1763701871429757, Instagram и WhatsApp) типа Business, входа
// через Facebook для обычных людей в нём нет: оттуда ни одной учётки не было. Выключатель на
// случай отказа Meta: false скрывает кнопку на странице входа.
const FACEBOOK_LOGIN_ENABLED = true

// Вход по коду из письма (03.11.2026): ссылку из письма часто открывают не в том браузере (письмо в почтовом
// приложении, а регистрация началась во встроенном браузере Instagram), и вход теряется. Код человек вводит в
// той же вкладке. Включено 04.11.2026: шаблоны с кодом (supabase/email-templates/*-with-code.html) вставлены в
// Supabase (Magic link or OTP и Confirm sign up). Убираете код из шаблонов — сначала поставьте false.
const LOGIN_CODE_ENABLED = true
// Длина кода задаётся в Supabase: Sign In / Providers → Email → Email OTP length (сейчас 8). Поменяли там —
// поменяйте здесь: кнопка включается и вход идёт сам ровно на этой длине.
const OTP_LENGTH = 8

// Кривая та же, что у остальных экранов (PageHeader, ProGate).
const EASE = [0.16, 1, 0.3, 1] as const

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
  const [linkExpired, setLinkExpired] = useState(false)
  const reduceMotion = !!useReducedMotion()
  // Направление шага: 1 вперёд (форма -> «проверьте почту»), -1 назад («Изменить адрес»).
  const [dir, setDir] = useState<1 | -1>(1)
  // Подсказка про опечатку в почте: показана до отправки; «Нет, отправить так» запоминает адрес.
  const [typoFix, setTypoFix] = useState<string | null>(null)
  const typoSkipped = useRef('')
  const [code, setCode] = useState('')
  const [codeBusy, setCodeBusy] = useState(false)
  const [codeError, setCodeError] = useState(false)
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
    // Пришли с /auth/callback после просроченной или использованной ссылки из письма.
    if (params.get('link') === 'expired') setLinkExpired(true)
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
      // 429 приходит с английским текстом для API-клиентов: человеку показываем свой язык.
      if (optRes.status === 429) { alert(t.passkeyTooManyError); return }
      const optJson = await optRes.json()
      if (optJson.error) { alert(t.errorPrefix(optJson.error)); return }

      const authResp = await startAuthentication({ optionsJSON: optJson.options })

      const verifyRes = await fetch('/api/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: optJson.challengeId, response: authResp }),
      })
      if (verifyRes.status === 429) { alert(t.passkeyTooManyError); return }
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

  async function sendLink({ again = false, to }: { again?: boolean; to?: string } = {}) {
    const address = (to ?? email).trim()
    if (!address) { alert(t.emailRequiredError); return }
    if (!address.includes('@')) { alert(t.invalidEmailError); return }
    // Опечатка в адресе (gmial.com) это письмо в никуда: спрашиваем до отправки, один раз на адрес.
    if (!again && typoSkipped.current !== address) {
      const fix = suggestEmailFix(address)
      if (fix) { setTypoFix(fix); return }
    }
    setTypoFix(null)
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
        body: JSON.stringify({ email: address }),
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
    // БИН, который человек поставил на слежение до входа: письмо часто открывают в другом
    // браузере (из встроенного браузера Instagram в почтовое приложение), где localStorage пуст.
    const pendingBin = peekPendingBinWatch()
    if (pendingBin) otpData.pending_bin_watch = pendingBin
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
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
      if (to) setEmail(address)
      setDir(1)
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

  async function verifyCode(value = code) {
    const token = value.replace(/\D/g, '')
    if (token.length !== OTP_LENGTH || codeBusy) return
    setCodeBusy(true)
    setCodeError(false)
    try {
      // Новому адресу Supabase шлёт письмо подтверждения регистрации, и код из него проверяется как 'signup';
      // существующему письмо со ссылкой, код из него как 'email'. Не знаем заранее, какое пришло: пробуем оба.
      let { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
      if (error) ({ error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'signup' }))
      if (error) { setCodeError(true); return }
      // Сессия уже сохранена в этом браузере. Всё остальное (реферал, слежение за БИН, куда направить
      // новичка) делает /auth/callback, как после ссылки из письма.
      router.replace('/auth/callback')
    } catch {
      setCodeError(true)
    } finally {
      setCodeBusy(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--nav-bg)' }} aria-busy="true">
        {/* checkingSession начинается с true и на сервере: без этого заголовка в исходном
            HTML страницы входа не было ни одного h1 (аудит 02.11.2026). Виден только читалкам. */}
        <h1 className="sr-only">INVOICES.KZ</h1>
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid var(--nav-accent)', borderTopColor: 'transparent' }} />
        {dialogElement}
      </main>
    )
  }

  // Шаги входа сменяются сдвигом: вперёд уходит влево, «Изменить адрес» возвращает вправо.
  const slide = {
    enter: (d: number) => ({ opacity: 0, x: reduceMotion ? 0 : d * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduceMotion ? 0 : d * -28 }),
  }
  const mail = sent ? mailProviderLink(email) : null
  const socialButton = 'w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-3 transition-colors min-h-12 hover:bg-[var(--nav-accent-soft)]'
  const socialStyle = { border: '1px solid var(--nav-border)', background: 'var(--nav-surface-elevated)', color: 'var(--nav-text-primary)' } as const

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--nav-bg)' }}>
      <div className="rounded-2xl p-8 w-full max-w-sm overflow-hidden" style={{ background: 'var(--nav-surface-elevated)', border: '1px solid var(--nav-border)', boxShadow: '0 12px 40px -16px rgba(28,32,86,.25)' }}>
        {/* A language switcher here because this page can be arrived at
            directly -- from a bookmark or the sign-in link in an email --
            and until now there was no way to change language once you had. */}
        <div className="flex justify-end mb-3">
          <div className="flex rounded-full p-0.5" style={{ background: 'var(--nav-accent-soft)' }}>
            {(['ru', 'kk', 'en'] as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className="rounded-full px-2.5 min-h-8 text-[11px] font-semibold uppercase transition-colors"
                style={lang === l ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { color: 'var(--nav-text-secondary)' }}>
                {l === 'kk' ? 'ҚЗ' : l}
              </button>
            ))}
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>INVOICES<span style={{ color: 'var(--nav-accent)' }}>.KZ</span></h1>
        <p className="text-sm mb-7" style={{ color: 'var(--nav-text-secondary)' }}>{t.loginSubtitle}</p>

        <AnimatePresence mode="wait" initial={false} custom={dir}>
        {!sent ? (
          <motion.div key="form" custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: EASE }}>
            {passkeySupported && (
              <button onClick={loginWithPasskey} disabled={passkeyLoading}
                className={`${socialButton} mb-3 disabled:opacity-60`}
                style={{ border: '1px solid var(--nav-accent)', background: 'transparent', color: 'var(--nav-accent)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.9 3.1-7 7-7 1.2 0 2.3.3 3.3.8" /><path d="M16 21v-6m0 0 2-2m-2 2-2-2m2 2h4" />
                </svg>
                {passkeyLoading ? t.sendingButton : t.passkeyLoginButton}
              </button>
            )}
            <button onClick={signInWithGoogle} className={`${socialButton} mb-3`} style={socialStyle}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 32.8 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.7-3.1-11.3-7.7l-6.5 5C9.6 39.5 16.3 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C40.9 35.4 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/>
              </svg>
              {t.googleSignInButton}
            </button>
            {FACEBOOK_LOGIN_ENABLED && <button onClick={signInWithFacebook} className={`${socialButton} mb-3`} style={socialStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#1877F2" d="M24 12c0-6.6-5.4-12-12-12S0 5.4 0 12c0 6 4.4 11 10.1 11.9v-8.4H7.1V12h3v-2.6c0-3 1.8-4.7 4.6-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4C19.6 23 24 18 24 12z"/>
              </svg>
              {t.facebookSignInButton}
            </button>}

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px" style={{ background: 'var(--nav-border)' }} />
              <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.orEmailDivider}</span>
              <div className="flex-1 h-px" style={{ background: 'var(--nav-border)' }} />
            </div>

            {linkExpired && (
              <p role="alert" className="text-xs rounded-lg px-3 py-2 mb-3 leading-relaxed" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }}>
                {t.linkExpiredNotice}
              </p>
            )}
            <label htmlFor="login-email" className="text-xs mb-2 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.emailLabel}</label>
            <input
              id="login-email"
              className="w-full rounded-xl px-3 py-3 text-sm outline-none mb-3 min-h-12 focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
              style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }}
              placeholder={t.emailPlaceholder}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={e => { formTouched.current = true; setEmail(e.target.value); if (typoFix) setTypoFix(null) }}
              onKeyDown={e => e.key === 'Enter' && sendLink()}
            />
            {typoFix && (
              <div role="alert" className="rounded-xl p-3 mb-3 text-xs" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-primary)' }}>
                {/* Адрес целиком, без переноса по «@», и подчёркнут: его надо прочитать, а не пробежать глазами. */}
                <div className="font-medium">
                  {t.didYouMeanBefore}{' '}
                  <span className="underline whitespace-nowrap font-semibold">{typoFix}</span>
                  {t.didYouMeanAfter === '?' ? '?' : ` ${t.didYouMeanAfter}`}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void sendLink({ to: typoFix })}
                    className="rounded-lg px-3 min-h-11 font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {t.useFixButton}
                  </button>
                  <button type="button" onClick={() => { typoSkipped.current = email.trim(); void sendLink() }}
                    className="rounded-lg px-3 min-h-11 font-semibold" style={{ color: 'var(--nav-accent)' }}>
                    {t.keepMineButton}
                  </button>
                </div>
              </div>
            )}
            <button onClick={() => sendLink()} disabled={loading}
              className="w-full rounded-xl py-4 font-semibold text-sm min-h-12 transition-opacity disabled:opacity-60"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {loading ? t.sendingButton : t.sendLinkButton}
            </button>
            {/* Everything on this screen says "Войти", but people arrive
                here from a button that says "Начать бесплатно" — and there
                is no separate sign-up anywhere. Someone without an account
                had every reason to think they were in the wrong place. */}
            <p className="text-xs mt-4 text-center leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{t.noAccountHint}</p>
          </motion.div>
        ) : (
          <motion.div key="sent" custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: EASE }} className="text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" />
              </svg>
            </div>
            <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }} role="status">{t.checkEmailTitle}</p>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{t.linkSentPrefix}<br /><strong style={{ color: 'var(--nav-text-primary)' }} className="break-all">{email}</strong></p>
            {mail && (
              <a href={mail.href} target="_blank" rel="noopener noreferrer"
                className="mt-5 flex items-center justify-center rounded-xl py-3 text-sm font-semibold min-h-12"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {t.openMailButton(mail.name)}
              </a>
            )}
            {LOGIN_CODE_ENABLED && (
              <form className="mt-5 text-left" onSubmit={e => { e.preventDefault(); void verifyCode() }}>
                <p className="text-xs mb-2" style={{ color: 'var(--nav-text-secondary)' }}>{t.codeHint}</p>
                <label htmlFor="login-code" className="sr-only">{t.codeLabel}</label>
                <input id="login-code" value={code} maxLength={OTP_LENGTH} readOnly={codeBusy} aria-busy={codeBusy}
                  onChange={e => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH)
                    setCode(next)
                    setCodeError(false)
                    // Вставили или набрали код целиком: входим сразу, без нажатия кнопки.
                    if (next.length === OTP_LENGTH && next !== code) void verifyCode(next)
                  }}
                  inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" placeholder={'0'.repeat(OTP_LENGTH)}
                  className="w-full rounded-xl px-3 py-3 text-center text-lg tracking-[0.4em] outline-none min-h-12 tabular-nums focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                  style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }} />
                <button type="submit" disabled={codeBusy || code.length !== OTP_LENGTH}
                  className="mt-2 w-full rounded-xl py-3 text-sm font-semibold min-h-12 disabled:opacity-50"
                  style={{ border: '1px solid var(--nav-accent)', color: 'var(--nav-accent)' }}>
                  {codeBusy ? t.codeChecking : t.codeButton}
                </button>
                {codeError && <p role="alert" className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{t.codeInvalid}</p>}
              </form>
            )}
            {/* Both of these were missing, and between them they are the only
                way out of this screen when the letter does not show up: the
                folder to look in, and a second try. */}
            <p className="text-xs mt-4" style={{ color: 'var(--nav-text-muted)' }}>{t.spamHint}</p>
            <button
              onClick={() => sendLink({ again: true })}
              disabled={loading || resent}
              className="text-sm font-medium mt-3 min-h-11 disabled:opacity-60"
              style={{ color: resent ? 'var(--nav-text-muted)' : 'var(--nav-accent)' }}>
              {resent ? t.resentNote : (loading ? t.sendingButton : t.resendLinkButton)}
            </button>
            <button onClick={() => { setDir(-1); setSent(false); setResent(false); setCode(''); setCodeError(false) }}
              className="text-sm mt-2 block w-full min-h-11" style={{ color: 'var(--nav-text-muted)' }}>
              {t.changeEmailButton}
            </button>
          </motion.div>
        )}
        </AnimatePresence>
        {TURNSTILE_SITE_KEY && <TurnstileWidget ref={captchaRef} siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} />}
      </div>
      {dialogElement}
    </main>
  )
}
