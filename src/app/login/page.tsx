'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { startAuthentication } from '@simplewebauthn/browser'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { authDict } from '@/lib/i18n/auth'
import { hasPendingUpgrade } from '@/lib/pendingUpgrade'

export default function Login() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = authDict[lang]
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) localStorage.setItem('referral_code', ref)
    setPasskeySupported(typeof window !== 'undefined' && !!window.PublicKeyCredential)
  }, [])

  async function loginWithPasskey() {
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
      // preserve here -- safe to send straight to /upgrade when the landing
      // page's pricing CTA left one pending (see src/lib/pendingUpgrade.ts).
      // Default destination unchanged (router.push('/dashboard')).
      if (hasPendingUpgrade()) router.replace('/upgrade')
      else router.push('/dashboard')
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError') alert(t.errorPrefix(e?.message || String(e)))
    } finally {
      setPasskeyLoading(false)
    }
  }

  async function sendLink() {
    if (!email) { alert(t.emailRequiredError); return }
    if (!email.includes('@')) { alert(t.invalidEmailError); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: 'https://invoices.kz/auth/callback' }
    })
    if (error) {
      alert(t.errorPrefix(error.message === 'Invalid email' ? t.invalidEmailMessage : error.message))
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://invoices.kz/auth/callback' }
    })
  }

  async function signInWithFacebook() {
    await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: 'https://invoices.kz/auth/callback' }
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm">
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
              placeholder={t.emailPlaceholder}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendLink()}
            />
            <button onClick={sendLink} disabled={loading}
              className="w-full bg-[#2DC48D] text-white rounded-xl py-4 font-medium text-sm">
              {loading ? t.sendingButton : t.sendLinkButton}
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <p className="font-medium text-[#1C2056] mb-2">{t.checkEmailTitle}</p>
            <p className="text-sm text-gray-500">{t.linkSentPrefix}<br/><strong>{email}</strong></p>
            <button onClick={() => setSent(false)} className="text-sm text-gray-400 mt-6">
              {t.changeEmailButton}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}