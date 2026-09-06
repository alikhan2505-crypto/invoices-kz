'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, deleteLabel } from '@/lib/a11yLabels'
import { profileAccountsDict, ProfileAccountsContent } from '@/lib/i18n/profileAccounts'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

// Same rounded-bordered field treatment used by src/app/create/page.tsx's form inputs.
const INPUT_CLS = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
// Info/hint icon for the payment-buttons callout box.
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
    </svg>
  )
}

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
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
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

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-2xl mx-auto p-4 space-y-4">

        <motion.div {...fadeIn(0)} className="nav-glass rounded-2xl px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn transition-colors flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }} aria-label={backLabel(lang)}>
            <ChevronLeftIcon />
          </button>
          <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.connectorsHeaderLabel}</span>
        </motion.div>

        {/* Оплата */}
        <motion.div {...fadeIn(1)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.paymentButtonsSectionLabel}</div>
          <div className="nav-glass rounded-2xl p-4 space-y-4">
            <div className="rounded-xl p-3 text-xs flex items-start gap-2" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-secondary)' }}>
              <span style={{ color: 'var(--nav-accent)' }}><InfoIcon /></span>
              {t.paymentButtonsHint}
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.kaspiPayLinkLabel}</label>
              <input className={INPUT_CLS}
                placeholder={t.kaspiPayPlaceholder}
                value={kaspiLink} onChange={e => setKaspiLink(e.target.value)} />
              <p className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiPayHint}</p>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.halykPayLinkLabel}</label>
              <input className={INPUT_CLS}
                placeholder={t.halykPayPlaceholder}
                value={halykLink} onChange={e => setHalykLink(e.target.value)} />
            </div>
          </div>
        </motion.div>

        {/* Сайт */}
        <motion.div {...fadeIn(2)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.websiteSectionLabel}</div>
          <div className="nav-glass rounded-2xl p-4">
            <input className={INPUT_CLS}
              placeholder={t.websitePlaceholder}
              value={website} onChange={e => setWebsite(e.target.value)} />
          </div>
        </motion.div>

        {/* Соцсети */}
        <motion.div {...fadeIn(3)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.socialMediaSectionLabel}</div>
          <div className="nav-glass rounded-2xl p-4 space-y-3">
            {socialLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0 text-base"
                  style={{ background: 'var(--nav-border-soft)' }}>
                  {getSocialIcon(link)}
                </span>
                <input className={`flex-1 ${INPUT_CLS}`}
                  placeholder={t.socialMediaPlaceholder}
                  value={link}
                  onChange={e => {
                    const updated = [...socialLinks]
                    updated[i] = e.target.value
                    setSocialLinks(updated)
                  }} />
                {socialLinks.length > 1 && (
                  <button onClick={() => setSocialLinks(socialLinks.filter((_, j) => j !== i))}
                    className="transition-colors flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--nav-critical)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--nav-text-muted)')}
                    aria-label={deleteLabel(lang)}>
                    <XIcon />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setSocialLinks([...socialLinks, ''])}
              className="flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2 w-full border transition-colors"
              style={{ borderColor: 'var(--nav-accent)', color: 'var(--nav-accent)' }}>
              <PlusIcon />
              {t.addSocialButton}
            </button>
          </div>
        </motion.div>

        {/* Preview */}
        {(kaspiLink || halykLink || website || socialLinks.some(l => l)) && (
          <motion.div {...fadeIn(4)}>
            <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.previewSectionLabel}</div>
            <div className="nav-glass rounded-2xl p-4 space-y-2">
              {kaspiLink && (
                <div className="w-full rounded-xl py-3 text-sm font-medium text-center text-white" style={{ background: '#F14635' }}>
                  {t.payViaKaspiLabel}
                </div>
              )}
              {halykLink && (
                <div className="w-full rounded-xl py-3 text-sm font-medium text-center text-white" style={{ background: '#00A650' }}>
                  {t.payViaHalykLabel}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {website && (
                  <span className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>{t.websiteBadgeLabel}</span>
                )}
                {socialLinks.filter(l => l).map((l, i) => (
                  <span key={i} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>
                    {getSocialIcon(l)} {getSocialName(l, t)}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <motion.button {...fadeIn(5)} onClick={save} disabled={saving}
          className="w-full rounded-xl py-4 font-medium text-sm transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {saving ? t.savingEllipsis : t.saveConnectorsButton}
        </motion.button>

      </div>
    </main>
    </DesktopShell>
  )
}
