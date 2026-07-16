'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { profileContentDict } from '@/lib/i18n/profileContent'

export default function Referral() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const [profile, setProfile] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
    }
    load()
  }, [])

  async function copyLink() {
    const link = `https://invoices.kz/login?ref=${profile?.referral_code}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function shareWhatsApp() {
    const link = `https://invoices.kz/login?ref=${profile?.referral_code}`
    const text = t.whatsAppShareMessage(link)
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">{t.referralHeaderLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Header */}
            <div className="bg-[#1C2056] rounded-2xl p-6 text-center">
            <div className="text-4xl mb-3">🎁</div>
            <div className="text-xl font-bold text-white mb-2">{t.referralBannerTitle}</div>
            <div className="text-white/60 text-sm">
                {t.referralBannerDescBefore} <span className="text-[#2DC48D] font-bold">{t.referralBannerBonusBold}</span> {t.referralBannerDescAfter}
            </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#1C2056]">{profile?.referral_count || 0}</div>
            <div className="text-xs text-gray-400 mt-1">{t.invitedFriendsLabel}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#2DC48D]">
              {profile?.bonus_expires_at && new Date(profile.bonus_expires_at) > new Date()
                ? Math.ceil((new Date(profile.bonus_expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : (profile?.referral_count || 0) * 7}
            </div>
            <div className="text-xs text-gray-400 mt-1">{t.bonusDaysLabel}</div>
        </div>
        </div>

        {/* Referral link */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="text-sm font-medium text-[#1C2056] mb-3">{t.yourReferralLinkLabel}</div>
          <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 truncate">
              invoices.kz/login?ref={profile?.referral_code}
            </span>
            <button onClick={copyLink}
              className={`text-xs px-3 py-1.5 rounded-lg ml-2 flex-shrink-0 transition ${copied ? 'bg-[#2DC48D] text-white' : 'bg-[#1C2056] text-white'}`}>
              {copied ? t.copiedLabel : t.copyLinkButton}
            </button>
          </div>
          <button onClick={shareWhatsApp}
            className="w-full bg-[#25D366] text-white rounded-xl py-3 text-sm font-medium">
            {t.shareWhatsAppButton}
          </button>
        </div>

        {/* How it works */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="text-sm font-medium text-[#1C2056] mb-4">{t.howItWorksLabel}</div>
          <div className="space-y-3">
            {[
              { step: '1', text: t.referralStep1 },
              { step: '2', text: t.referralStep2 },
              { step: '3', text: t.referralStep3 },
              { step: '4', text: t.referralStep4 },
            ].map(item => (
              <div key={item.step} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#1C2056] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {item.step}
                </div>
                <span className="text-sm text-gray-600">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}