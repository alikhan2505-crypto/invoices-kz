'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { startRegistration } from '@simplewebauthn/browser'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import { profileAccountsDict } from '@/lib/i18n/profileAccounts'
import { useAppDialog } from '@/components/AppDialog'
import PageHeader from '@/components/PageHeader'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

function KeyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.6 12.4 7.9-7.9M15 6l2.5 2.5M18 3l3 3" />
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
  // Shadows window.alert / window.confirm for this component -- see
  // src/components/AppDialog.tsx. Every confirm below is awaited: a Promise
  // is truthy, so `if (confirm(...))` would silently pass.
  const { alert, confirm, dialogElement } = useAppDialog()
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
    if (!(await confirm(t.passkeyRemoveConfirm))) return
    await supabase.from('webauthn_credentials').delete().eq('id', id)
    setPasskeys(prev => prev.filter(p => p.id !== id))
  }

  return (
      <>
        <div className="max-w-lg lg:max-w-2xl mx-auto p-4">
          <PageHeader
            title={t.securityHeaderLabel}
            backHref="/profile"
          />

          <div className="space-y-4">
            {/* Passkeys */}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
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

          </div>
        </div>
      {dialogElement}
      </>
  )
}
