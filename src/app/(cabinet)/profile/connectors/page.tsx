'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { deleteLabel } from '@/lib/a11yLabels'
import { profileAccountsDict, ProfileAccountsContent } from '@/lib/i18n/profileAccounts'
import { useAppDialog } from '@/components/AppDialog'
import PageContainer from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

// Same rounded-bordered field treatment used by src/app/create/page.tsx's form inputs.
const INPUT_CLS = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

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

// Значок площадки линейным SVG (раньше -- эмодзи, которые в каждой ОС рисуются
// по-своему и выбиваются из стиля кабинета). Узнаваемость даёт подпись рядом.
function SocialIcon({ url, size = 16 }: { url: string; size?: number }) {
  const u = url || ''
  let d: React.ReactNode
  if (u.includes('instagram')) d = <><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.5" /><path d="M16.8 7.2h.01" /></>
  else if (u.includes('tiktok') || u.includes('youtube')) d = <><rect x="3" y="5.5" width="18" height="13" rx="4" /><path d="m10.5 9.5 4 2.5-4 2.5Z" /></>
  else if (u.includes('t.me') || u.includes('telegram')) d = <path d="M21 4 3 11l6 2.2L11 20l3-4.5 4.5 3.3Z" />
  else if (u.includes('2gis')) d = <><path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10.5" r="2.3" /></>
  else if (u.includes('whatsapp')) d = <path d="M5 19l1.1-3.6A7.5 7.5 0 1 1 8.8 18Z" />
  else if (u.includes('facebook') || u.includes('linkedin') || u.includes('twitter') || u.includes('x.com')) d = <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>
  else d = <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
      {d}
    </svg>
  )
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
  // Shadows window.alert for this component -- see src/components/AppDialog.tsx.
  const { alert, dialogElement } = useAppDialog()
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
    <>
      <PageContainer className="space-y-4">

        <PageHeader title={t.connectorsHeaderLabel} backHref="/profile" />

        <div className="space-y-4 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-4 xl:items-start">
        <div className="space-y-4">
        {/* Оплата */}
        <motion.div {...fadeIn(1)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.paymentButtonsSectionLabel}</div>
          <div className="nav-glass rounded-2xl p-4 space-y-4">
            <div className="rounded-xl p-3 text-xs flex items-start gap-2" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-secondary)' }}>
              <span style={{ color: 'var(--nav-accent)' }}><InfoIcon /></span>
              {t.paymentButtonsHint}
            </div>
            <div>
              <label className="text-xs mb-1 flex items-center gap-1.5" style={{ color: 'var(--nav-text-secondary)' }}>
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#F14635' }} aria-hidden="true" />
                {t.kaspiPayLinkLabel}
              </label>
              <input className={INPUT_CLS}
                placeholder={t.kaspiPayPlaceholder}
                value={kaspiLink} onChange={e => setKaspiLink(e.target.value)} />
              <p className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.kaspiPayHint}</p>
            </div>
            <div>
              <label className="text-xs mb-1 flex items-center gap-1.5" style={{ color: 'var(--nav-text-secondary)' }}>
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#00A650' }} aria-hidden="true" />
                {t.halykPayLinkLabel}
              </label>
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

        </div>
        <div className="space-y-4">
        {/* Соцсети */}
        <motion.div {...fadeIn(3)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.socialMediaSectionLabel}</div>
          <div className="nav-glass rounded-2xl p-4 space-y-3">
            {socialLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>
                  <SocialIcon url={link} />
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
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>
                    <SocialIcon url={l} size={14} />
                    {getSocialName(l, t)}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        </div>
        </div>

        <motion.button {...fadeIn(5)} onClick={save} disabled={saving}
          className="w-full lg:w-fit lg:px-16 rounded-xl py-4 font-medium text-sm transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {saving ? t.savingEllipsis : t.saveConnectorsButton}
        </motion.button>

      </PageContainer>
      {dialogElement}
    </>
  )
}
