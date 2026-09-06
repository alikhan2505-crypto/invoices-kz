'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { startRegistration } from '@simplewebauthn/browser'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileAccountsDict } from '@/lib/i18n/profileAccounts'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}
function SignatureIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17s2.5-8 5-8 2 6 4.5 6S16 7 18 7s3 6 3 6" />
      <path d="M3 21h18" />
    </svg>
  )
}
function KeyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.6 12.4 7.9-7.9M15 6l2.5 2.5M18 3l3 3" />
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
    </svg>
  )
}

type Passkey = { id: string; device_label: string | null; created_at: string; last_used_at: string | null }

function guessDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Device'
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Device'
}

export default function Security() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileAccountsDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [addingPasskey, setAddingPasskey] = useState(false)

  useEffect(() => {
    setPasskeySupported(typeof window !== 'undefined' && !!window.PublicKeyCredential)
    loadPasskeys()
  }, [])

  async function loadPasskeys() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('webauthn_credentials')
      .select('id, device_label, created_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setPasskeys(data || [])
  }

  async function addPasskey() {
    setAddingPasskey(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const optRes = await fetch('/api/webauthn/register-options', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const optJson = await optRes.json()
      if (optJson.error) { alert(t.errorPrefix(optJson.error)); return }

      const attResp = await startRegistration({ optionsJSON: optJson.options })

      const verifyRes = await fetch('/api/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ challengeId: optJson.challengeId, response: attResp, deviceLabel: guessDeviceLabel() }),
      })
      const verifyJson = await verifyRes.json()
      if (verifyJson.error) { alert(t.errorPrefix(verifyJson.error)); return }

      await loadPasskeys()
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError') alert(t.errorPrefix(e?.message || String(e)))
    } finally {
      setAddingPasskey(false)
    }
  }

  async function removePasskey(id: string) {
    if (!confirm(t.passkeyRemoveConfirm)) return
    await supabase.from('webauthn_credentials').delete().eq('id', id)
    setPasskeys(prev => prev.filter(p => p.id !== id))
  }

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-2xl mx-auto p-4">
          <motion.div
            className="flex items-center gap-3 mb-5"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
          >
            <button
              onClick={() => router.push('/profile')}
              aria-label={backLabel(lang)}
              className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
              style={{ color: 'var(--nav-text-muted)' }}
            >
              <ChevronLeftIcon />
            </button>
            <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.securityHeaderLabel}</h2>
          </motion.div>

          <div className="space-y-4">
            {/* ECP explanation */}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
            >
              <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>
                {t.electronicSignatureSectionLabel}
              </div>
              <div className={`nav-glass rounded-2xl p-4 ${CARD_HOVER}`}>
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--nav-accent-soft), transparent)', color: 'var(--nav-accent)' }}
                  >
                    <SignatureIcon />
                  </span>
                  <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.ecpHowItWorksTitle}</div>
                </div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{t.ecpHowItWorksBody}</div>
              </div>
            </motion.div>

            {/* Passkeys */}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.12 }}
            >
              <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>
                {t.loginSecuritySectionLabel}
              </div>
              <div className="nav-glass rounded-2xl overflow-hidden">
                {passkeys.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: i < passkeys.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--nav-teal-soft), transparent)', color: 'var(--nav-teal)' }}
                      >
                        <KeyIcon />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm truncate" style={{ color: 'var(--nav-text-primary)' }}>{p.device_label || t.passkeyDefaultLabel}</div>
                        <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                          {p.last_used_at ? t.passkeyLastUsedPrefix(formatDate(p.last_used_at)) : t.passkeyAddedPrefix(formatDate(p.created_at))}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removePasskey(p.id)}
                      className="text-xs font-medium rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
                      style={{ color: 'var(--nav-critical)', border: '1px solid var(--nav-border)' }}>
                      {t.deleteTitle}
                    </button>
                  </div>
                ))}

                {!passkeySupported ? (
                  <div className="px-4 py-3.5 text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.passkeyNotSupportedHint}</div>
                ) : (
                  <div className="px-4 py-3.5" style={{ borderTop: passkeys.length > 0 ? '1px solid var(--nav-border-soft)' : 'none' }}>
                    {passkeys.length === 0 && (
                      <div className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.passkeyNoneHint}</div>
                    )}
                    <button onClick={addPasskey} disabled={addingPasskey}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
                      style={{ border: '1px solid var(--nav-accent)', color: 'var(--nav-accent)' }}>
                      {addingPasskey ? t.savingEllipsis : t.passkeyAddButton}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Info */}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.18 }}
              className="rounded-2xl p-4 flex gap-3"
              style={{ background: 'var(--nav-accent-soft)' }}
            >
              <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--nav-accent)' }}><InfoIcon /></span>
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.whatIsEcpTitle}</div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>
                  {t.whatIsEcpBody}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </DesktopShell>
  )
}
