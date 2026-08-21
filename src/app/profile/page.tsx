'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { useLanguage } from '@/components/LanguageProvider'
import { cacheGet, cacheSet, cacheClear } from '@/lib/cache'
import { getActivePlan } from '@/lib/plan'
import { profileCoreDict } from '@/lib/i18n/profileCore'
import { useMediaQuery } from '@/lib/useMediaQuery'
import Skeleton from '@/components/Skeleton'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

// ---- icons (2px stroke, inline SVG -- no emoji) ----

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M14 10h5a1 1 0 0 1 1 1v10" />
      <path d="M9 8h.01M9 12h.01M9 16h.01" />
      <path d="M2 21h20" />
    </svg>
  )
}
function PaletteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.8.7-1.5 1.5-1.5H16a4 4 0 0 0 4-4c0-5-4.5-10-8-10Z" />
      <circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}
function CardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  )
}
function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
function AcquiringIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h2" />
    </svg>
  )
}
function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <path d="M8 12h8" />
    </svg>
  )
}
function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <path d="M16 4.3c1.5.4 2.6 1.7 2.6 3.3 0 1.6-1.1 2.9-2.6 3.3" />
      <path d="M15 13.7c2.7.5 4.5 2.4 4.5 5.3" />
    </svg>
  )
}
function TagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.6 2H4a2 2 0 0 0-2 2v8.6a2 2 0 0 0 .6 1.4l9.2 9.2a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8L14.6 2.6A2 2 0 0 0 12.6 2Z" />
      <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}
function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17l-6.1 3.5 1.5-6.8-5.2-4.7 6.9-.7Z" />
    </svg>
  )
}
function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  )
}
function ContractIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6" />
      <path d="m9 16 2 1.5L15 15" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 12.5 6 8Z" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
    </svg>
  )
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v12H8l-4 4V4z" />
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
    </svg>
  )
}
function GiftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="18" height="4" />
      <path d="M12 9v12M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
      <path d="M12 9C10 5 6 5 6 7.5A2.5 2.5 0 0 0 8.5 9M12 9c2-4 6-4 6-1.5A2.5 2.5 0 0 1 15.5 9" />
    </svg>
  )
}
function AdminIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
function BriefcaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M2 12h20" />
    </svg>
  )
}
function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m6 6 2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  )
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  )
}
function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 4 6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-6-4-9s1.5-6.4 4-9Z" />
    </svg>
  )
}

// A grouped "settings list" row -- icon badge, label, optional count badge,
// chevron. Matches the approved settings-list treatment (plain nav-glass
// container, no accent bar; each row is its own clickable target).
function ListRow({
  icon, colorVar, label, badge, isLast, onClick,
}: {
  icon: React.ReactNode
  colorVar: string
  label: string
  badge?: number
  isLast: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between mx-2 px-3 py-3 rounded-xl cursor-pointer transition-all duration-150 hover:translate-x-1 hover:bg-[var(--nav-surface-glass)]"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--nav-border-soft)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, var(${colorVar}-soft), transparent)`, color: `var(${colorVar})` }}
        >
          {icon}
        </span>
        <span className="text-sm truncate" style={{ color: 'var(--nav-text-primary)' }}>{label}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {!!badge && badge > 0 && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
          >
            {badge}
          </span>
        )}
        <span style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
      </div>
    </div>
  )
}

export default function Profile() {
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const { lang, setLang } = useLanguage()
  const t = profileCoreDict[lang]
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [stats, setStats] = useState({ clients: 0, services: 0, income: 0, invoices: 0 })
  const [chartData, setChartData] = useState<{ month: string; income: number }[]>([])
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const cachedProfile = cacheGet('profile_' + user.id)
      if (cachedProfile) setProfile(cachedProfile)

      const [{ data: p }, { data: c }, { data: s }, { data: inv }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('clients').select('id').eq('user_id', user.id),
        supabase.from('services').select('id').eq('user_id', user.id),
        supabase.from('invoices').select('amount, status, created_at').eq('user_id', user.id),
      ])

      setProfile(p)
      if (p) cacheSet('profile_' + user.id, p)
      if (p?.is_admin) setIsAdmin(true)

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthIncome = (inv || [])
        .filter((i: any) => i.status === 'paid' && i.created_at >= monthStart)
        .reduce((sum: number, i: any) => sum + Number(i.amount), 0)

      setStats({
        clients: (c || []).length,
        services: (s || []).length,
        income: monthIncome,
        invoices: (inv || []).length,
      })

      const months: { month: string; income: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()
        const monthTotal = (inv || [])
          .filter((inv: any) => inv.created_at >= start && inv.created_at <= end)
          .reduce((sum: number, inv: any) => sum + Number(inv.amount), 0)
        months.push({ month: d.toLocaleString('ru-KZ', { month: 'short' }), income: monthTotal })
      }
      setChartData(months)
      setLoading(false)
    }
    load()
  }, [])

  async function signOut() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) cacheClear('profile_' + user.id)
    await supabase.auth.signOut()
    router.push('/login')
  }

  const DELETE_CONFIRM_PHRASE = 'INVOICES.KZ'

  async function deleteAccount() {
    if (deleteConfirmText !== DELETE_CONFIRM_PHRASE || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ confirmText: deleteConfirmText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeleteError(data.error || t.errorPrefix(''))
        setDeleting(false)
        return
      }
      if (profile?.id) cacheClear('profile_' + profile.id)
      await supabase.auth.signOut()
      router.push('/login')
    } catch (e: any) {
      setDeleteError(t.errorPrefix(e.message || ''))
      setDeleting(false)
    }
  }



  if (loading && !profile) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-5xl mx-auto p-4 space-y-4">
        <div className="nav-glass nav-card-accent rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="nav-glass rounded-2xl p-4 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="nav-glass rounded-2xl p-4 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </main>
    </DesktopShell>
  )

  const initials = profile?.company_name ? profile.company_name.slice(0, 2).toUpperCase() : 'FP'
  const activePlan = getActivePlan(profile)

  const companyItems = [
    { icon: <BuildingIcon />, label: t.requisitesMenuLabel, href: '/profile/requisites' },
    { icon: <PaletteIcon />, label: t.signatureMenuLabel, href: '/profile/signature' },
    { icon: <CardIcon />, label: t.banksMenuLabel, href: '/profile/banks' },
    { icon: <ShieldIcon />, label: t.securityMenuLabel, href: '/profile/security' },
    { icon: <AcquiringIcon />, label: t.acquiringMenuLabel, href: '/profile/acquiring' },
    { icon: <LinkIcon />, label: t.connectorsMenuLabel, href: '/profile/connectors' },
  ]

  const directoryItems = [
    { icon: <PeopleIcon />, label: t.clientsMenuLabel, href: '/profile/clients', badge: stats.clients },
    { icon: <TagIcon />, label: t.servicesMenuLabel, href: '/profile/services', badge: stats.services },
    { icon: <StarIcon />, label: t.templatesMenuLabel, href: '/profile/templates', badge: 0 },
    { icon: <DocumentIcon />, label: t.documentsMenuLabel, href: '/profile/documents', badge: 0 },
    { icon: <ContractIcon />, label: t.contractsMenuLabel, href: '/profile/contracts', badge: 0 },
  ]

  const settingsItems = [
    { icon: <GearIcon />, label: t.invoiceSettingsLabel, href: '/profile/settings' },
    { icon: <BellIcon />, label: t.notificationsMenuLabel, href: '/profile/notifications' },
    { icon: <ChatIcon />, label: t.supportMenuLabel, href: '/profile/support' },
    { icon: <InfoIcon />, label: t.aboutMenuLabel, href: '/profile/about' },
    { icon: <GiftIcon />, label: t.referralMenuLabel, href: '/profile/referral' },
    ...(isAdmin ? [
      { icon: <AdminIcon />, label: t.adminPanelMenuLabel, href: '/admin' },
      { icon: <ChatIcon />, label: t.igRepliesMenuLabel, href: '/profile/instagram-replies' },
    ] : []),
  ]

  const planIcon = activePlan.isTrial ? <SparkleIcon /> : activePlan.plan === 'pro' ? <StarIcon /> : activePlan.plan === 'basic' ? <BriefcaseIcon /> : <TagIcon />
  const planColorVar = activePlan.isTrial ? '--nav-magenta' : activePlan.plan === 'pro' ? '--nav-accent' : activePlan.plan === 'basic' ? '--nav-teal' : '--nav-text-muted'
  // --nav-text-muted has no "-soft" companion token (unlike accent/teal/magenta), so the
  // free-plan badge falls back to the border-soft tint instead of an invalid var() reference.
  const planColorSoft = planColorVar === '--nav-text-muted' ? 'var(--nav-border-soft)' : `var(${planColorVar}-soft)`

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  const profileCardEl = (
    <motion.div {...fadeIn(0)} className={`nav-glass nav-card-accent rounded-2xl p-5 ${CARD_HOVER}`}>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-base truncate" style={{ color: 'var(--nav-text-primary)' }}>{profile?.company_name || t.fillProfileLabel}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{profile?.bin_iin ? t.binIinPrefixLabel(profile.bin_iin) : t.noDataLabel}</div>
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--nav-bg)' }}>
            {stats.invoices === 0 ? (
              <div className="text-center py-2">
                <p className="text-sm mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.noInvoicesYetHint}</p>
                <button onClick={() => router.push('/create')}
                  className="px-4 py-2 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {t.createFirstInvoiceButton}
                </button>
              </div>
            ) : (
              <>
            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.incomeThisMonthLabel}</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{stats.income.toLocaleString('ru-KZ')} ₸</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--nav-success)' }}>{t.totalInvoicesLabel(stats.invoices)}</div>
              </>
            )}
            {stats.invoices > 0 && chartData.some(d => d.income > 0) && (
              <>
                <div className="mt-3 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--nav-accent)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="var(--nav-accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip
                        formatter={(value: any) => [value.toLocaleString('ru-KZ') + ' ₸', t.chartIncomeLabel]}
                        contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}
                      />
                      <Area type="monotone" dataKey="income" stroke="var(--nav-accent)" strokeWidth={2} fill="url(#incomeGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between mt-1">
                  {chartData.map(d => (
                    <span key={d.month} className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{d.month}</span>
                  ))}
                </div>
              </>
            )}
          </div>
    </motion.div>
  )

  const companyEl = (
    <motion.div {...fadeIn(1)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.companySectionLabel}</div>
          <div className="nav-glass rounded-2xl overflow-hidden py-1">
            {companyItems.map((item, i, arr) => (
              <ListRow
                key={item.href}
                icon={item.icon}
                colorVar="--nav-accent"
                label={item.label}
                isLast={i === arr.length - 1}
                onClick={() => router.push(item.href)}
              />
            ))}
          </div>
    </motion.div>
  )

  const directoriesEl = (
    <motion.div {...fadeIn(2)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.directoriesSectionLabel}</div>
          <div className="nav-glass rounded-2xl overflow-hidden py-1">
            {directoryItems.map((item, i, arr) => (
              <ListRow
                key={item.href}
                icon={item.icon}
                colorVar="--nav-teal"
                label={item.label}
                badge={item.badge}
                isLast={i === arr.length - 1}
                onClick={() => router.push(item.href)}
              />
            ))}
          </div>
    </motion.div>
  )

  const settingsEl = (
    <motion.div {...fadeIn(3)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.settingsSectionLabel}</div>
          <div className="nav-glass rounded-2xl overflow-hidden py-1">
            {settingsItems.map((item, i, arr) => (
              <ListRow
                key={item.href}
                icon={item.icon}
                colorVar="--nav-magenta"
                label={item.label}
                isLast={i === arr.length - 1}
                onClick={() => router.push(item.href)}
              />
            ))}
          </div>
    </motion.div>
  )

  const subscriptionEl = (
    <motion.div {...fadeIn(4)} className={`nav-glass nav-card-accent rounded-2xl overflow-hidden ${CARD_HOVER}`}>
          <div className="px-4 py-4 flex items-center justify-between cursor-pointer" onClick={() => router.push('/upgrade')}>
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${planColorSoft}, transparent)`, color: `var(${planColorVar})` }}
                >
                  {planIcon}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--nav-text-primary)' }}>{activePlan.label}</div>
                  <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                    {activePlan.plan === 'pro' && !activePlan.isTrial && t.proFeaturesLabel}
                    {activePlan.plan === 'basic' && !activePlan.isTrial && t.basicFeaturesLabel}
                    {activePlan.plan === 'free' && t.freeFeaturesLabel}
                    {activePlan.isTrial && t.trialFeaturesLabel}
                  </div>
                </div>
              </div>
              <span style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
          </div>

            {(profile?.plan_expires_at || profile?.bonus_expires_at || profile?.trial_expires_at) && (
              <div className="px-4 py-3 space-y-2" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>

                {/* 1. Тарифный план */}
                {profile?.plan_expires_at && profile?.plan !== 'free' && new Date(profile.plan_expires_at) > new Date() && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--nav-text-muted)' }}>
                      {t.planActiveUntilLabel(profile.plan === 'pro' ? t.proTariffLabel : t.basicTariffLabel)}
                    </span>
                    <span className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>
                      {new Date(profile.plan_expires_at).toLocaleDateString('ru-KZ')}
                    </span>
                  </div>
                )}

                {/* 2. Реферальный бонус — показываем дату когда закончится */}
                {profile?.bonus_expires_at && new Date(profile.bonus_expires_at) > new Date() && (() => {
                  const bonusDays = Math.ceil((new Date(profile.bonus_expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  // Если есть активный платный план — бонус добавляется к его дате
                  let bonusEndDate: Date
                  if (profile?.plan_expires_at && new Date(profile.plan_expires_at) > new Date()) {
                    bonusEndDate = new Date(profile.plan_expires_at)
                    bonusEndDate.setDate(bonusEndDate.getDate() + bonusDays)
                  } else {
                    bonusEndDate = new Date(profile.bonus_expires_at)
                  }
                  return (
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--nav-text-muted)' }}>{t.referralBonusLabel(bonusDays)}</span>
                      <span className="font-medium" style={{ color: 'var(--nav-success)' }}>
                        {t.untilDateLabel(bonusEndDate.toLocaleDateString('ru-KZ'))}
                      </span>
                    </div>
                  )
                })()}

                {/* 3. Пробный период — только если нет платного плана И нет бонуса И не истёк */}
                {profile?.trial_expires_at &&
                new Date(profile.trial_expires_at) > new Date() &&
                !(profile?.plan && profile.plan !== 'free' && profile?.plan_expires_at && new Date(profile.plan_expires_at) > new Date()) &&
                !(profile?.bonus_expires_at && new Date(profile.bonus_expires_at) > new Date()) && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--nav-text-muted)' }}>{t.trialUntilLabel}</span>
                    <span className="font-medium" style={{ color: 'var(--nav-success)' }}>
                      {new Date(profile.trial_expires_at).toLocaleDateString('ru-KZ')}
                    </span>
                  </div>
                )}

              </div>
            )}

    </motion.div>
  )

  const themeEl = (
    <motion.div {...fadeIn(5)} className="nav-glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span style={{ color: 'var(--nav-text-muted)' }}>{theme === 'dark' ? <MoonIcon /> : <SunIcon />}</span>
              <span className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{theme === 'dark' ? t.darkThemeLabel : t.lightThemeLabel}</span>
            </div>
            <button onClick={toggle}
              className="w-12 h-6 rounded-full transition-colors relative"
              style={{ background: theme === 'dark' ? 'var(--nav-accent)' : 'var(--nav-border)' }}>
              <span
                className="absolute top-1 w-4 h-4 rounded-full shadow transition-all"
                style={{ background: 'var(--nav-surface-chrome)', left: theme === 'dark' ? '1.75rem' : '0.25rem' }}
              ></span>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
            <div className="flex items-center gap-3">
              <span style={{ color: 'var(--nav-text-muted)' }}><GlobeIcon /></span>
              <span className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{t.languageSectionLabel}</span>
            </div>
            <div className="flex rounded-full p-0.5" style={{ background: 'var(--nav-bg)' }}>
              <button onClick={() => setLang('ru')}
                className="px-3 py-1 text-xs rounded-full transition-colors font-semibold"
                style={{ background: lang === 'ru' ? 'var(--nav-accent)' : 'transparent', color: lang === 'ru' ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)' }}>
                RU
              </button>
              <button onClick={() => setLang('kk')}
                className="px-3 py-1 text-xs rounded-full transition-colors font-semibold"
                style={{ background: lang === 'kk' ? 'var(--nav-accent)' : 'transparent', color: lang === 'kk' ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)' }}>
                ҚЗ
              </button>
              <button onClick={() => setLang('en')}
                className="px-3 py-1 text-xs rounded-full transition-colors font-semibold"
                style={{ background: lang === 'en' ? 'var(--nav-accent)' : 'transparent', color: lang === 'en' ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)' }}>
                ENG
              </button>
            </div>
          </div>
    </motion.div>
  )

  const signOutEl = (
    <motion.button {...fadeIn(6)} onClick={signOut}
      className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
      style={{ background: 'var(--nav-critical)' }}>
      {t.signOutButton}
    </motion.button>
  )

  // Deliberately quieter than signOutEl -- a rare, severe action shouldn't
  // compete visually with the common one right above it.
  const deleteAccountEl = (
    <motion.button {...fadeIn(7)} onClick={() => setDeleteModalOpen(true)}
      className="w-full rounded-xl py-2.5 text-xs font-medium transition-colors hover:underline"
      style={{ color: 'var(--nav-text-muted)' }}>
      {t.deleteAccountButton}
    </motion.button>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="max-w-lg lg:max-w-5xl mx-auto p-4">
        {isDesktop ? (
          <div className="flex gap-6 items-start">
            <div className="flex flex-col gap-4 w-[360px] flex-shrink-0">
              {profileCardEl}
              {subscriptionEl}
              {themeEl}
              {signOutEl}
              {deleteAccountEl}
            </div>
            <div className="flex flex-col gap-4 flex-1 min-w-0">
              {companyEl}
              {directoriesEl}
              {settingsEl}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {profileCardEl}
            {companyEl}
            {directoriesEl}
            {settingsEl}
            {subscriptionEl}
            {themeEl}
            {signOutEl}
            {deleteAccountEl}
          </div>
        )}
      </div>

      <AnimatePresence>
        {deleteModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30"
            onClick={() => { if (!deleting) { setDeleteModalOpen(false); setDeleteConfirmText(''); setDeleteError('') } }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="relative nav-glass rounded-[24px] w-full max-w-sm overflow-hidden"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
              onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--nav-critical)' }} />
              <div className="p-5">
                <div className="text-base font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.deleteAccountModalTitle}</div>
                <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>{t.deleteAccountModalBody}</p>
                <label className="block mb-4">
                  <span className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--nav-text-muted)' }}>
                    {t.deleteAccountModalConfirmLabel(DELETE_CONFIRM_PHRASE)}
                  </span>
                  <input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder={DELETE_CONFIRM_PHRASE} disabled={deleting} autoFocus
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border-soft)' }} />
                </label>
                {deleteError && (
                  <div className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>{deleteError}</div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText(''); setDeleteError('') }} disabled={deleting}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
                    {t.deleteAccountModalCancelButton}
                  </button>
                  <button onClick={deleteAccount} disabled={deleteConfirmText !== DELETE_CONFIRM_PHRASE || deleting}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: 'var(--nav-critical)' }}>
                    {deleting ? t.deleteAccountModalDeletingLabel : t.deleteAccountModalConfirmButton}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </main>
    </DesktopShell>
  )
}
