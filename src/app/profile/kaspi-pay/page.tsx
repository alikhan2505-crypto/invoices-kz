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
      if (!res.ok || !data.processId) { setError(t.errorGeneric); return }
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
      if (!res.ok || !data.apiToken) { setError(t.errorInvalidOtp); return }
      setApiToken(data.apiToken)
      setConnected(true)
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

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.headerLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {!ap.canAcquiring ? (
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
        ) : (
          <>
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-xs text-gray-600 leading-relaxed">{t.introText}</p>
            </div>

            {error && <p className="text-xs text-red-500 px-1">{error}</p>}

            {apiToken ? (
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
                <button onClick={disconnect} disabled={disconnecting}
                  className="w-full bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm font-medium">
                  {disconnecting ? t.disconnectingLabel : t.disconnectButton}
                </button>
              </div>
            ) : !processId ? (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <label className="block text-xs text-gray-500 mb-1">{t.phoneLabel}</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phonePlaceholder}
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
