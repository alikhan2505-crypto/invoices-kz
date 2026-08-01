'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { kaspiPayDict } from '@/lib/i18n/kaspiPay'

export default function KaspiPayPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = kaspiPayDict[lang]

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [connected, setConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [processId, setProcessId] = useState<string | null>(null)
  const [apiToken, setApiToken] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Same formatting as the phone field in /profile/requisites — keeps the
  // input's shape consistent across the app rather than accepting anything
  // a user happens to type before it's sent to Kaspi's own entrance API.
  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    let result = '+7'
    if (digits.length > 1) result += ' ' + digits.slice(1, 4)
    if (digits.length > 4) result += ' ' + digits.slice(4, 7)
    if (digits.length > 7) result += ' ' + digits.slice(7, 9)
    if (digits.length > 9) result += ' ' + digits.slice(9, 11)
    return result
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    // kaspi_connections has no client-facing RLS policy — status is read
    // through this authenticated route, not a direct table query.
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/kaspi/status', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setConnected(!!data.connected)
      setConnectionStatus(data.status ?? null)
    }

    setLoading(false)
  }

  async function sendCode() {
    setError('')
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/connect/init', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      })
      const data = await res.json()
      if (!res.ok || !data.processId) {
        // The Pro gate is enforced server-side too, so a lapsed plan can be
        // refused here even though this page rendered the form — say why
        // instead of blaming Kaspi for being unavailable.
        setError(data.error === 'not_pro' ? t.errorNotPro : t.errorGeneric)
        return
      }
      setProcessId(data.processId)
    } finally {
      setSending(false)
    }
  }

  async function verify() {
    setError('')
    setVerifying(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/connect/verify', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId, otp }),
      })
      const data = await res.json()
      if (!res.ok || !data.apiToken) {
        // invalid_otp means the code was wrong — the user can retry with a
        // new one. Anything else (save_failed, expired_or_invalid_process)
        // means Kaspi-side pairing may have already succeeded but this
        // attempt is now dead either way — telling the user "wrong code"
        // here would send them into a retry loop that can never succeed,
        // since processId is already gone server-side.
        setError(
          data.error === 'invalid_otp' ? t.errorInvalidOtp
          : data.error === 'not_pro' ? t.errorNotPro
          : t.errorGeneric
        )
        setProcessId(null)
        return
      }
      setApiToken(data.apiToken)
      setConnected(true)
      setConnectionStatus('active')
      setProcessId(null)
    } finally {
      setVerifying(false)
    }
  }

  async function disconnect() {
    setDisconnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/kaspi/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      setConnected(false)
      setConnectionStatus(null)
      setApiToken(null)
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  const ap = getActivePlan(profile)

  // Rendered in BOTH the Pro and non-Pro branches below, same reasoning as
  // /profile/acquiring's bccConnectedCard: a user whose Pro plan lapses
  // while a Kaspi connection is live still has a real device paired against
  // their own Kaspi account. /api/kaspi/pay now refuses them, but the pairing
  // itself outlives the subscription, so the disconnect control — the only
  // way to actually tear it down from here — must stay reachable.
  const connectedCard = apiToken ? (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="text-sm font-medium text-[#1C2056] mb-2">{t.connectedMessage}</div>
      <div className="text-xs text-amber-600 mb-2">{t.tokenShownOnceWarning}</div>
      <div className="bg-gray-50 rounded-xl p-3 text-xs font-mono break-all mb-3">{apiToken}</div>
      <button onClick={() => navigator.clipboard.writeText(apiToken)}
        className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium mb-2">
        {t.copyTokenButton}
      </button>
      <button onClick={disconnect} disabled={disconnecting}
        className="w-full bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm font-medium">
        {disconnecting ? t.disconnectingLabel : t.disconnectButton}
      </button>
    </div>
  ) : connected ? (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="text-sm font-medium text-[#1C2056] mb-3">{t.connectedMessage}</div>
      {/* The polling cron parks a connection here when Kaspi has refused its
          credentials or its stored secrets stopped decrypting — reconnecting
          is the only fix, so say so instead of leaving a dead connection
          looking healthy. */}
      {connectionStatus === 'error' && (
        <div className="text-xs text-amber-600 mb-3">{t.connectionErrorHint}</div>
      )}
      <button onClick={disconnect} disabled={disconnecting}
        className="w-full bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm font-medium">
        {disconnecting ? t.disconnectingLabel : t.disconnectButton}
      </button>
    </div>
  ) : null

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.headerLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {!ap.canAcquiring ? (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="text-sm font-medium text-[#1C2056] flex-1">{t.headerLabel}</div>
                <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                  🔒 {t.proBadge}
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-3">{t.proLockedHint}</div>
              <button onClick={() => router.push('/upgrade')}
                className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                {t.goToPlansButton}
              </button>
            </div>

            {connectedCard && (
              <>
                {error && <p className="text-xs text-red-500 px-1">{error}</p>}
                {connectedCard}
              </>
            )}
          </>
        ) : (
          <>
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-xs text-gray-600 leading-relaxed">{t.introText}</p>
            </div>

            {error && <p className="text-xs text-red-500 px-1">{error}</p>}

            {connectedCard ? connectedCard : !processId ? (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <label className="block text-xs text-gray-500 mb-1">{t.phoneLabel}</label>
                <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder={t.phonePlaceholder}
                  type="tel" maxLength={16}
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056] mb-3" />
                <button onClick={sendCode} disabled={sending || !phone}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                  {sending ? t.sendingCodeLabel : t.sendCodeButton}
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <label className="block text-xs text-gray-500 mb-1">{t.otpLabel}</label>
                <input value={otp} onChange={e => setOtp(e.target.value)} placeholder={t.otpPlaceholder}
                  type="text" inputMode="numeric" maxLength={6}
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056] mb-3" />
                <button onClick={verify} disabled={verifying || !otp}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                  {verifying ? t.verifyingLabel : t.verifyButton}
                </button>
              </div>
            )}

            <button onClick={() => router.push('/profile/kaspi-pay/docs')}
              className="w-full text-xs text-[#1C2056] underline text-center py-2">
              {t.docsLinkLabel}
            </button>
          </>
        )}
      </div>
    </main>
  )
}
