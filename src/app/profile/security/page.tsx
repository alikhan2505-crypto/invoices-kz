'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/LanguageProvider'
import { profileAccountsDict } from '@/lib/i18n/profileAccounts'

export default function Security() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileAccountsDict[lang]
  const [ecpConnected] = useState(false)

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
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-lg">🔐</span>
                <span className="text-sm text-gray-800">{t.faceIdRowLabel}</span>
              </div>
              <div className="text-xs text-gray-400">{t.comingSoonLabel}</div>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-lg">🔑</span>
                <span className="text-sm text-gray-800">{t.changePinRowLabel}</span>
              </div>
              <div className="text-xs text-gray-400">{t.comingSoonLabel}</div>
            </div>
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