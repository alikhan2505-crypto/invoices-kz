'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, deleteLabel } from '@/lib/a11yLabels'
import { profileAccountsDict, ProfileAccountsContent } from '@/lib/i18n/profileAccounts'

function getSocialIcon(url: string): string {
  if (!url) return '🔗'
  if (url.includes('instagram')) return '📸'
  if (url.includes('facebook')) return '👤'
  if (url.includes('tiktok')) return '🎵'
  if (url.includes('youtube')) return '▶️'
  if (url.includes('t.me') || url.includes('telegram')) return '✈️'
  if (url.includes('twitter') || url.includes('x.com')) return '🐦'
  if (url.includes('linkedin')) return '💼'
  if (url.includes('2gis')) return '📍'
  if (url.includes('whatsapp')) return '💬'
  return '🔗'
}

function getSocialName(url: string, t: ProfileAccountsContent): string {
  if (!url) return t.emptyLinkLabel
  if (url.includes('instagram')) return 'Instagram'
  if (url.includes('facebook')) return 'Facebook'
  if (url.includes('tiktok')) return 'TikTok'
  if (url.includes('youtube')) return 'YouTube'
  if (url.includes('t.me') || url.includes('telegram')) return 'Telegram'
  if (url.includes('twitter') || url.includes('x.com')) return 'Twitter/X'
  if (url.includes('linkedin')) return 'LinkedIn'
  if (url.includes('2gis')) return '2GIS'
  if (url.includes('whatsapp')) return 'WhatsApp'
  return t.genericLinkLabel
}

export default function ConnectorsPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileAccountsDict[lang]
  const [saving, setSaving] = useState(false)
  const [kaspiLink, setKaspiLink] = useState('')
  const [halykLink, setHalykLink] = useState('')
  const [website, setWebsite] = useState('')
  const [socialLinks, setSocialLinks] = useState<string[]>([''])
  const [userId, setUserId] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      const { data: p } = await supabase.from('profiles')
        .select('kaspi_pay_link, halyk_pay_link, website, social_links')
        .eq('id', user.id).single()
      if (p) {
        setKaspiLink(p.kaspi_pay_link || '')
        setHalykLink(p.halyk_pay_link || '')
        setWebsite(p.website || '')
        setSocialLinks(p.social_links?.length ? p.social_links : [''])
      }
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    const filtered = socialLinks.filter(l => l.trim())
    await supabase.from('profiles').update({
      kaspi_pay_link: kaspiLink || null,
      halyk_pay_link: halykLink || null,
      website: website || null,
      social_links: filtered,
    }).eq('id', userId)
    setSaving(false)
    alert(t.savedAlert)
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.connectorsHeaderLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Оплата */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.paymentButtonsSectionLabel}</div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700">
              {t.paymentButtonsHint}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.kaspiPayLinkLabel}</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.kaspiPayPlaceholder}
                value={kaspiLink} onChange={e => setKaspiLink(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">{t.kaspiPayHint}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.halykPayLinkLabel}</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.halykPayPlaceholder}
                value={halykLink} onChange={e => setHalykLink(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Сайт */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.websiteSectionLabel}</div>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
              placeholder={t.websitePlaceholder}
              value={website} onChange={e => setWebsite(e.target.value)} />
          </div>
        </div>

        {/* Соцсети */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.socialMediaSectionLabel}</div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            {socialLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xl w-8">{getSocialIcon(link)}</span>
                <input className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                  placeholder={t.socialMediaPlaceholder}
                  value={link}
                  onChange={e => {
                    const updated = [...socialLinks]
                    updated[i] = e.target.value
                    setSocialLinks(updated)
                  }} />
                {socialLinks.length > 1 && (
                  <button onClick={() => setSocialLinks(socialLinks.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-400 text-xl" aria-label={deleteLabel(lang)}>×</button>
                )}
              </div>
            ))}
            <button onClick={() => setSocialLinks([...socialLinks, ''])}
              className="text-xs text-[#1C2056] border border-[#1C2056] rounded-lg px-3 py-2 w-full">
              {t.addSocialButton}
            </button>
          </div>
        </div>

        {/* Preview */}
        {(kaspiLink || halykLink || website || socialLinks.some(l => l)) && (
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.previewSectionLabel}</div>
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              {kaspiLink && (
                <div className="w-full bg-amber-400 text-white rounded-xl py-3 text-sm font-medium text-center">
                  {t.payViaKaspiLabel}
                </div>
              )}
              {halykLink && (
                <div className="w-full bg-green-500 text-white rounded-xl py-3 text-sm font-medium text-center">
                  {t.payViaHalykLabel}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {website && (
                  <span className="bg-gray-100 text-gray-600 rounded-lg px-3 py-1.5 text-xs">{t.websiteBadgeLabel}</span>
                )}
                {socialLinks.filter(l => l).map((l, i) => (
                  <span key={i} className="bg-gray-100 text-gray-600 rounded-lg px-3 py-1.5 text-xs">
                    {getSocialIcon(l)} {getSocialName(l, t)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <button onClick={save} disabled={saving}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
          {saving ? t.savingEllipsis : t.saveConnectorsButton}
        </button>
      </div>
    </main>
  )
}