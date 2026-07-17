'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { startRegistration } from '@simplewebauthn/browser'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import { profileAccountsDict } from '@/lib/i18n/profileAccounts'

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
  const [ecpConnected] = useState(false)
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
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">{t.securityHeaderLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* ECP status */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.electronicSignatureSectionLabel}</div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            {ecpConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#2DC48D]/10 flex items-center justify-center text-xl">🔒</div>
                  <div>
                    <div className="text-sm font-medium text-[#2DC48D]">{t.ecpConnectedLabel}</div>
                    <div className="text-xs text-gray-400">{t.ecpValidUntilDummy}</div>
                    <div className="text-xs text-gray-400">{t.ecpHolderDummy}</div>
                  </div>
                </div>
                <button className="text-xs text-red-400 border border-red-200 rounded-lg px-3 py-1.5">
                  {t.disconnectButton}
                </button>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">🔓</div>
                <div className="text-sm font-medium text-[#1C2056] mb-1">{t.ecpNotConnectedLabel}</div>
                <div className="text-xs text-gray-400 mb-4">{t.ecpNotConnectedHint}</div>
                <button
                  onClick={() => alert(t.connectEcpAlert)}
                  className="bg-[#1C2056] text-white px-6 py-2.5 rounded-xl text-sm font-medium">
                  {t.connectEcpButton}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Security */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.loginSecuritySectionLabel}</div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {passkeys.map((p, i) => (
              <div key={p.id} className={`flex items-center justify-between px-4 py-3.5 ${i < passkeys.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">🔐</span>
                  <div>
                    <div className="text-sm text-gray-800">{p.device_label || t.passkeyDefaultLabel}</div>
                    <div className="text-xs text-gray-400">
                      {p.last_used_at ? t.passkeyLastUsedPrefix(formatDate(p.last_used_at)) : t.passkeyAddedPrefix(formatDate(p.created_at))}
                    </div>
                  </div>
                </div>
                <button onClick={() => removePasskey(p.id)} className="text-xs text-red-400 border border-red-200 rounded-lg px-3 py-1.5 flex-shrink-0">
                  {t.deleteTitle}
                </button>
              </div>
            ))}

            {!passkeySupported ? (
              <div className="px-4 py-3.5 text-xs text-gray-400">{t.passkeyNotSupportedHint}</div>
            ) : (
              <div className={`px-4 py-3.5 ${passkeys.length > 0 ? 'border-t border-gray-100' : ''}`}>
                {passkeys.length === 0 && (
                  <div className="text-xs text-gray-400 mb-3">{t.passkeyNoneHint}</div>
                )}
                <button onClick={addPasskey} disabled={addingPasskey}
                  className="w-full border border-[#1C2056] text-[#1C2056] rounded-xl py-2.5 text-sm font-medium">
                  {addingPasskey ? t.savingEllipsis : t.passkeyAddButton}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="bg-[#1C2056]/5 rounded-2xl p-4">
          <div className="text-xs text-[#1C2056] font-medium mb-1">{t.whatIsEcpTitle}</div>
          <div className="text-xs text-gray-500 leading-relaxed">
            {t.whatIsEcpBody}
          </div>
        </div>
      </div>
    </main>
  )
}