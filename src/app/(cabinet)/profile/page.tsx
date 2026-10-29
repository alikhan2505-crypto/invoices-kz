'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { signOutForLogin } from '@/lib/signOut'
import { useTheme, type ThemeMode } from '@/components/ThemeProvider'
import { useLanguage } from '@/components/LanguageProvider'
import { cacheGet, cacheSet, cacheClear } from '@/lib/cache'
import { getActivePlan, parseDbTimestamp } from '@/lib/plan'
import LapsedPlanNotice from '@/components/LapsedPlanNotice'
import { invoiceLimitWindow } from '@/lib/invoiceLimit'
import { formatDateNumeric } from '@/lib/date'
import { companyIdKind, companyInitials } from '@/lib/companyIdentity'
import { localMonthQueryFloor, sumPaidInMonth } from '@/lib/invoiceStats'
import { profileCoreDict } from '@/lib/i18n/profileCore'
import { useMediaQuery } from '@/lib/useMediaQuery'
import Skeleton from '@/components/Skeleton'
import ProfileBonusCard from '@/components/ProfileBonusCard'
import { prefetchProfileBonusStatus } from '@/lib/profileBonusClient'
import PageContainer from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'
import { binWatchDict } from '@/lib/i18n/binWatch'
import { canUseBinWatch } from '@/lib/binWatch/config'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

// Подъём карточки — только на устройствах с настоящим наведением: на телефоне
// после тапа hover «залипает», и карточка оставалась приподнятой.
const CARD_HOVER = 'transition-all duration-200 ease-out [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[var(--nav-card-glow)]'

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
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
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

// У --nav-text-muted нет пары «-soft» (в отличие от accent/teal/magenta) —
// для него подложка значка берётся из --nav-border-soft, иначе var() невалиден.
function softTint(colorVar: string): string {
  return colorVar === '--nav-text-muted' ? 'var(--nav-border-soft)' : `var(${colorVar}-soft)`
}

// A grouped "settings list" row -- icon badge, label, optional grey count or
// «Про» tag, chevron. Matches the approved settings-list treatment (plain
// nav-glass container, no accent bar). Это настоящая ссылка (next/link), а не
// div с onClick: работает с клавиатуры, открывается в новой вкладке,
// предзагружается. Без сдвига при наведении — на телефоне «залипал» после тапа.
function ListRow({
  icon, colorVar, label, href, count, proTag, isLast,
}: {
  icon: React.ReactNode
  colorVar: string
  label: string
  href: string
  count?: number
  proTag?: string
  isLast: boolean
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between mx-2 px-3 py-3 rounded-xl transition-colors duration-150 hover:bg-[var(--nav-surface-glass)] focus-visible:outline-2 focus-visible:outline-[color:var(--nav-accent)]"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--nav-border-soft)' }}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span
          className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${softTint(colorVar)}, transparent)`, color: `var(${colorVar})` }}
        >
          {icon}
        </span>
        <span className="text-sm leading-snug min-w-0 break-words" style={{ color: 'var(--nav-text-primary)' }}>{label}</span>
        {proTag && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
            style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-muted)' }}
          >
            {proTag}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        {typeof count === 'number' && count > 0 && (
          <span className="text-xs tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{count}</span>
        )}
        <span style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
      </span>
    </Link>
  )
}

type MenuItem = { icon: React.ReactNode; label: string; href: string; count?: number; proOnly?: boolean }

const DELETE_CONFIRM_PHRASE = 'INVOICES.KZ'
// Регистр и пробелы по краям не важны — так же сравнивает /api/account/delete.
const normalizeConfirm = (text: string) => text.trim().toUpperCase()

export default function Profile() {
  const router = useRouter()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const { lang } = useLanguage()
  const t = profileCoreDict[lang]
  const pageTitle = lang === 'en' ? 'Profile' : 'Профиль'
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // paidThisMonth — только оплаченные счета этого месяца; any — все счета,
  // включая черновики (и счётчик «Счетов», и пустое состояние).
  const [stats, setStats] = useState({ clients: 0, services: 0, paidThisMonth: 0, any: 0 })
  // Сколько счетов уже ушло из лимита Бесплатного (окно — invoiceLimitWindow,
  // как на /create и в триггере базы). null — ещё не посчитано или не Free.
  const [freeUsed, setFreeUsed] = useState<number | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    // Статус карточки «Готовность к счёту» грузится параллельно данным страницы, а не после них.
    prefetchProfileBonusStatus()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const cachedProfile = cacheGet('profile_' + user.id)
      if (cachedProfile) setProfile(cachedProfile)

      // Счётчики — head/count-запросами, а не загрузкой всех счетов, клиентов
      // и услуг. Раньше здесь грузился каждый счёт целиком, а график «Доход»
      // складывал ВСЕ счета, включая черновики и аннулированные. График убран;
      // «Оплачено в этом месяце» считает только оплаченные, той же логикой,
      // что и дашборд (src/lib/invoiceStats.ts).
      const now = new Date()
      const [
        { data: p },
        { count: clientsCount },
        { count: servicesCount },
        { count: anyCount },
        { data: paidRows },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('services').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        // Только оплаченные за месяц (с запасом в сутки — точную границу
        // проводит sumPaidInMonth): это единственные строки, что тут нужны.
        supabase.from('invoices').select('amount, status, created_at').eq('user_id', user.id).eq('status', 'paid').gte('created_at', localMonthQueryFloor(now)),
      ])

      setProfile(p)
      if (p) cacheSet('profile_' + user.id, p)

      setStats({
        clients: clientsCount || 0,
        services: servicesCount || 0,
        paidThisMonth: sumPaidInMonth(paidRows || [], now),
        any: anyCount || 0,
      })
      setLoading(false)

      // «Использовано N из 3» — то же окно и тот же подсчёт (все счета, и
      // отменённые тоже), что у /create и у триггера enforce_invoice_limit.
      const limitWindow = invoiceLimitWindow(p, now)
      if (limitWindow.kind === 'free') {
        const { count, error } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', limitWindow.windowStart.toISOString())
        if (!error) setFreeUsed(count || 0)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signOut() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) cacheClear('profile_' + user.id)
    router.push(await signOutForLogin())
  }

  const isAdmin = profile?.is_admin === true

  function closeDeleteModal() {
    if (deleting) return
    setDeleteModalOpen(false)
    setDeleteConfirmText('')
    setDeleteError('')
  }

  async function deleteAccount() {
    // Админский аккаунт не удаляется — сервер отказывает так же (403).
    if (isAdmin || normalizeConfirm(deleteConfirmText) !== DELETE_CONFIRM_PHRASE || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ confirmText: normalizeConfirm(deleteConfirmText) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeleteError(data.code === 'admin_account' ? t.deleteAccountAdminRefusal : (data.error || t.errorPrefix('')))
        setDeleting(false)
        return
      }
      if (profile?.id) cacheClear('profile_' + profile.id)
      router.push(await signOutForLogin())
    } catch (e: any) {
      setDeleteError(t.errorPrefix(e.message || ''))
      setDeleting(false)
    }
  }

  if (loading && !profile) return (
    <>
      <PageContainer variant="wide" className="space-y-4">
        <PageHeader title={pageTitle} />
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
      </PageContainer>
    </>
  )

  const now = new Date()
  const initials = companyInitials(profile?.company_name)
  const activePlan = getActivePlan(profile, now)

  // Какой период сейчас реально действует — в том же порядке, что
  // computeActivePlan(): платный → бонус → пробный → Бесплатный. Бонус идёт
  // параллельно с платным тарифом и к его дате НЕ прибавляется — поэтому
  // «Бонус Базового до …» показываем, только когда именно он и есть тариф.
  const planEnd = parseDbTimestamp(profile?.plan_expires_at)
  const paidActive = !!profile?.plan && profile.plan !== 'free' && (!profile?.plan_expires_at || (!!planEnd && planEnd > now))
  const bonusEnd = parseDbTimestamp(profile?.bonus_expires_at)
  const bonusIsPlan = !paidActive && !!bonusEnd && bonusEnd > now
  const trialEnd = parseDbTimestamp(profile?.trial_expires_at)
  const trialIsPlan = activePlan.isTrial && !!trialEnd
  const showPlanEndRow = paidActive && !!planEnd
  const fmtDate = (d: Date) => formatDateNumeric(d.toISOString())

  // Админ без действующего платного тарифа — не «Бесплатный» (под ним стоит
  // «все функции открыты», getActivePlan снимает для него все лимиты).
  const planTitle = isAdmin && !paidActive ? t.adminPlanTitle
    : paidActive
    ? (profile.plan === 'pro' ? t.proTariffLabel : t.basicTariffLabel)
    : bonusIsPlan ? t.bonusPlanTitle(activePlan.daysLeft ?? 0)
    : trialIsPlan ? t.trialPlanTitle(activePlan.daysLeft ?? 0)
    : t.freePlanTitle
  const planSubtitle = isAdmin ? t.adminAccessLabel
    : paidActive ? (profile.plan === 'pro' ? t.proFeaturesLabel : t.basicFeaturesLabel)
    : bonusIsPlan ? t.basicFeaturesLabel
    : trialIsPlan ? t.trialFeaturesLabel
    : freeUsed !== null ? t.freeUsageLabel(freeUsed, activePlan.invoiceLimit ?? 3)
    : t.freeUsageLoadingLabel(activePlan.invoiceLimit ?? 3)

  // Тег «Про» — только когда тариф уже известен (иначе он мигнул бы у Про-клиента).
  const planKnown = !!profile
  const proTagFor = (item: MenuItem, allowed: boolean) => (item.proOnly && planKnown && !allowed ? t.proTagLabel : undefined)

  const companyItems: MenuItem[] = [
    { icon: <BuildingIcon />, label: t.requisitesMenuLabel, href: '/profile/requisites' },
    { icon: <CardIcon />, label: t.banksMenuLabel, href: '/profile/banks' },
    { icon: <PaletteIcon />, label: t.signatureMenuLabel, href: '/profile/signature' },
    { icon: <LinkIcon />, label: t.connectorsMenuLabel, href: '/profile/connectors' },
  ]

  const documentItems: (MenuItem & { allowed?: boolean })[] = [
    { icon: <PeopleIcon />, label: t.clientsMenuLabel, href: '/profile/clients', count: loading ? undefined : stats.clients },
    // «Слежение за БИН»: пока админ-гейт включён (src/lib/binWatch/config.ts), пункт виден только админу.
    ...(canUseBinWatch(isAdmin) ? [{ icon: <EyeIcon />, label: binWatchDict[lang].menuLabel, href: '/profile/bin-watch' }] : []),
    { icon: <TagIcon />, label: t.servicesMenuLabel, href: '/profile/services', count: loading ? undefined : stats.services },
    { icon: <StarIcon />, label: t.templatesMenuLabel, href: '/profile/templates', proOnly: true, allowed: activePlan.canTemplates },
    { icon: <DocumentIcon />, label: t.documentsMenuLabel, href: '/profile/documents', proOnly: true, allowed: activePlan.canKpAvrNakl },
    { icon: <ContractIcon />, label: t.contractsMenuLabel, href: '/profile/contracts' },
    { icon: <GearIcon />, label: t.invoiceSettingsLabel, href: '/profile/settings' },
    { icon: <AcquiringIcon />, label: t.acquiringMenuLabel, href: '/profile/acquiring', proOnly: true, allowed: activePlan.canAcquiring },
  ]

  const accountItems: MenuItem[] = [
    { icon: <ShieldIcon />, label: t.securityMenuLabel, href: '/profile/security' },
    { icon: <BellIcon />, label: t.notificationsMenuLabel, href: '/profile/notifications' },
  ]

  const helpItems: MenuItem[] = [
    { icon: <ChatIcon />, label: t.supportMenuLabel, href: '/profile/support' },
    { icon: <GiftIcon />, label: t.referralMenuLabel, href: '/profile/referral' },
  ]

  const adminItems: MenuItem[] = [
    { icon: <AdminIcon />, label: t.adminPanelMenuLabel, href: '/admin' },
  ]

  const planIcon = isAdmin ? <AdminIcon /> : trialIsPlan ? <SparkleIcon /> : activePlan.plan === 'pro' ? <StarIcon /> : activePlan.plan === 'basic' ? <BriefcaseIcon /> : <TagIcon />
  const planColorVar = isAdmin ? '--nav-accent' : trialIsPlan ? '--nav-magenta' : activePlan.plan === 'pro' ? '--nav-accent' : activePlan.plan === 'basic' ? '--nav-teal' : '--nav-text-muted'
  const planColorSoft = softTint(planColorVar)

  const companyIdText = profile?.bin_iin
    ? (() => {
        const kind = companyIdKind(profile.company_name, profile.bin_iin)
        return kind === 'bin' ? t.binPrefixLabel(profile.bin_iin) : kind === 'iin' ? t.iinPrefixLabel(profile.bin_iin) : t.binOrIinPrefixLabel(profile.bin_iin)
      })()
    : t.noDataLabel

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  const profileCardEl = (
    <motion.div {...fadeIn(0)} className="nav-glass nav-card-accent rounded-2xl p-5">
          {/* Шапка карточки ведёт в реквизиты — там это и правится. */}
          <Link href="/profile/requisites" aria-label={t.companyCardOpenLabel}
            className="flex items-center gap-3 mb-4 -m-2 p-2 rounded-xl transition-colors hover:bg-[var(--nav-surface-glass)]">
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0"
              style={initials
                ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                : { background: 'var(--nav-border-soft)', color: 'var(--nav-text-muted)' }}
              aria-hidden="true"
            >
              {initials || <BuildingIcon />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-base truncate" style={{ color: 'var(--nav-text-primary)' }}>{profile?.company_name || t.fillProfileLabel}</span>
              <span className="block text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{companyIdText}</span>
            </span>
            <span className="flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
          </Link>
          {loading ? (
            // Профиль уже из кэша, а счётчики ещё грузятся — не показываем
            // «Создать первый счёт» тому, у кого счета есть.
            <Skeleton className="h-[92px] rounded-xl" />
          ) : stats.any === 0 ? (
            <div className="rounded-xl p-4 text-center" style={{ background: 'var(--nav-bg)' }}>
              <p className="text-sm mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.noInvoicesYetHint}</p>
              <Link href="/create"
                className="inline-block px-4 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {t.createFirstInvoiceButton}
              </Link>
            </div>
          ) : (
            // Весь блок ведёт на дашборд — там полная статистика.
            <Link href="/dashboard"
              className="w-full text-left rounded-xl p-4 flex items-end justify-between gap-3 transition-colors hover:bg-[var(--nav-surface-glass)]"
              style={{ background: 'var(--nav-bg)' }}>
              <span className="min-w-0">
                <span className="block text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.paidThisMonthLabel}</span>
                <span className="block text-2xl font-bold tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{stats.paidThisMonth.toLocaleString('ru-KZ')} ₸</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>
                  {/* Все счета, включая черновики (решение основателя 15.10: иначе
                      «Счетов» легко подкрутить, не отправляя их). */}
                  {t.issuedInvoicesLabel(stats.any)}
                </span>
              </span>
              <span className="flex items-center gap-1 text-xs font-medium flex-shrink-0" style={{ color: 'var(--nav-accent)' }}>
                {t.statsDashboardLink}
                <ChevronRightIcon />
              </span>
            </Link>
          )}
    </motion.div>
  )

  // Порядок групп ниже xl (стопки там «растворены» через contents) остаётся прежним:
  // Компания, Документы, Аккаунт, Помощь, Админ. С xl порядок внутри стопки тот же.
  const GROUP_ORDER_CLS: Record<number, string> = { 1: 'order-1', 2: 'order-2', 3: 'order-3', 4: 'order-4', 5: 'order-5' }
  // grow: последняя карточка стопки на десктопе тянется до низа соседней стопки
  // (две стопки равной высоты, без пустоты между блоками): обёртка и список -- flex-колонки;
  // строки НЕ растягиваем (иначе пункты меню выглядят раздутыми), лишняя высота
  // остаётся свободной внутри карточки под последней строкой.
  const groupEl = (index: number, title: string, colorVar: string, items: (MenuItem & { allowed?: boolean })[], grow = false) => (
    <motion.div {...fadeIn(index)} className={`${GROUP_ORDER_CLS[index] ?? ''} ${grow ? 'flex flex-col flex-1' : ''}`.trim() || undefined}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{title}</div>
          <nav aria-label={title} className={`nav-glass rounded-2xl overflow-hidden py-1 ${grow ? 'flex flex-col flex-1' : ''}`}>
            {items.map((item, i, arr) => (
              <ListRow
                key={item.href}
                icon={item.icon}
                colorVar={colorVar}
                label={item.label}
                href={item.href}
                count={item.count}
                proTag={proTagFor(item, item.allowed !== false)}
                isLast={i === arr.length - 1}
              />
            ))}
          </nav>
    </motion.div>
  )

  const companyEl = groupEl(1, t.companySectionLabel, '--nav-accent', companyItems)
  // Стопка 1: Компания, Аккаунт, Помощь (8 строк); стопка 2: Документы (7 строк)
  // + Админ. Строк почти поровну, поэтому добавка высоты у последней карточки стопки
  // (grow) делится на много строк и растяжение не бросается в глаза.
  const documentsEl = groupEl(2, t.documentsSectionLabel, '--nav-teal', documentItems, !isAdmin)
  const accountEl = groupEl(3, t.accountSectionLabel, '--nav-magenta', accountItems, false)
  const helpEl = groupEl(4, t.helpSectionLabel, '--nav-magenta', helpItems, true)
  // Отдельная группа «Админ» — из кэшированного профиля, сразу при первом
  // рендере: раньше пункт появлялся после загрузки и сдвигал список.
  const adminEl = isAdmin ? groupEl(5, t.adminSectionLabel, '--nav-text-muted', adminItems, true) : null

  const planDetailRows = showPlanEndRow || bonusIsPlan || trialIsPlan

  const subscriptionEl = (
    <motion.div {...fadeIn(1)} className={`nav-glass nav-card-accent rounded-2xl overflow-hidden ${CARD_HOVER}`}>
          <LapsedPlanNotice profile={profile} className="!rounded-none !border-0" />
          <Link href="/upgrade" className="px-4 py-4 flex items-center justify-between gap-3">
              <span className="flex items-center gap-3 min-w-0">
                <span
                  className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${planColorSoft}, transparent)`, color: `var(${planColorVar})` }}
                >
                  {planIcon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate" style={{ color: 'var(--nav-text-primary)' }}>{planTitle}</span>
                  <span className="block text-xs" style={{ color: 'var(--nav-text-muted)' }}>{planSubtitle}</span>
                </span>
              </span>
              <span className="flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}><ChevronRightIcon /></span>
          </Link>

            {/* Блок дат — только если в нём есть хотя бы одна строка (раньше у
                Бесплатного с истёкшим тарифом оставалась пустая полоска). */}
            {planDetailRows && (
              <div className="px-4 py-3 space-y-2" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                {showPlanEndRow && planEnd && (
                  <div className="flex justify-between gap-3 text-xs">
                    <span style={{ color: 'var(--nav-text-muted)' }}>
                      {t.planActiveUntilLabel(profile.plan === 'pro' ? t.proTariffLabel : t.basicTariffLabel)}
                    </span>
                    <span className="font-medium flex-shrink-0" style={{ color: 'var(--nav-text-primary)' }}>{fmtDate(planEnd)}</span>
                  </div>
                )}
                {bonusIsPlan && bonusEnd && (
                  <div className="flex justify-between gap-3 text-xs">
                    <span style={{ color: 'var(--nav-text-muted)' }}>{t.bonusBasicLabel}</span>
                    <span className="font-medium flex-shrink-0" style={{ color: 'var(--nav-success)' }}>{t.untilDateLabel(fmtDate(bonusEnd))}</span>
                  </div>
                )}
                {trialIsPlan && trialEnd && (
                  <div className="flex justify-between gap-3 text-xs">
                    <span style={{ color: 'var(--nav-text-muted)' }}>{t.trialUntilLabel}</span>
                    <span className="font-medium flex-shrink-0" style={{ color: 'var(--nav-success)' }}>{fmtDate(trialEnd)}</span>
                  </div>
                )}
              </div>
            )}
    </motion.div>
  )

  // Три варианта вместо переключателя «Светлая тема»: по нему было непонятно,
  // что сейчас включено и как вернуться к теме устройства.
  const themeOptions: { mode: ThemeMode; label: string }[] = [
    { mode: 'system', label: t.themeSystemLabel },
    { mode: 'light', label: t.themeLightLabel },
    { mode: 'dark', label: t.themeDarkLabel },
  ]
  const themeEl = (
    <motion.div {...fadeIn(5)} className="nav-glass rounded-2xl px-4 py-3.5">
          <div id="profile-theme-label" className="text-sm mb-2.5" style={{ color: 'var(--nav-text-primary)' }}>{t.themeSectionLabel}</div>
          <div role="group" aria-labelledby="profile-theme-label" className="grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: 'var(--nav-bg)' }}>
            {themeOptions.map(opt => {
              const on = themeMode === opt.mode
              return (
                <button key={opt.mode} type="button" aria-pressed={on}
                  onClick={() => setThemeMode(opt.mode)}
                  className="px-2 py-2 text-xs rounded-lg font-semibold transition-colors"
                  style={{ background: on ? 'var(--nav-accent)' : 'transparent', color: on ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)' }}>
                  {opt.label}
                </button>
              )
            })}
          </div>
    </motion.div>
  )

  // Обычное действие — спокойная контурная кнопка, без красного: выход ничего не ломает.
  const signOutEl = (
    <motion.button {...fadeIn(6)} type="button" onClick={signOut}
      className="w-full rounded-xl py-3 text-sm font-semibold transition-colors hover:bg-[var(--nav-surface-glass)]"
      style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)', background: 'transparent' }}>
      {t.signOutButton}
    </motion.button>
  )

  // Deliberately quieter than signOutEl -- a rare, severe action shouldn't
  // compete visually with the common one right above it.
  const deleteAccountEl = (
    <motion.button {...fadeIn(7)} type="button" onClick={() => setDeleteModalOpen(true)}
      className="w-full rounded-xl py-2.5 text-xs font-medium transition-colors hover:underline"
      style={{ color: 'var(--nav-text-muted)' }}>
      {t.deleteAccountButton}
    </motion.button>
  )

  const confirmMatches = normalizeConfirm(deleteConfirmText) === DELETE_CONFIRM_PHRASE

  return (
    <>
      <PageContainer variant="wide">
        {/* Видимый заголовок, как у остальных страниц верхнего уровня (дашборд, история, обзоры продуктов); стрелки нет: хаб это корень раздела. */}
        <PageHeader title={pageTitle} />
        {isDesktop ? (
          <div className="flex gap-6 items-start">
            <div className="flex flex-col gap-4 w-[360px] flex-shrink-0">
              {profileCardEl}
              <ProfileBonusCard />
              {subscriptionEl}
              {themeEl}
              {signOutEl}
              {deleteAccountEl}
            </div>
            {/* Две НЕЗАВИСИМЫЕ стопки рядом (с xl): иначе короткая «Компания»
                встаёт рядом с высокими «Документами», а «Аккаунт» уезжает под них
                с пустотой. Ниже xl стопки идут друг под другом (строки сетки не
                растягиваем: content-start), а внешняя строка тянется до низа левой
                колонки, и последняя карточка каждой стопки добирает высоту. */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch content-start xl:content-normal flex-1 min-w-0">
              <div className="contents xl:flex xl:flex-col xl:gap-4 xl:min-w-0">
                {companyEl}
                {accountEl}
                {helpEl}
              </div>
              <div className="contents xl:flex xl:flex-col xl:gap-4 xl:min-w-0">
                {documentsEl}
                {adminEl}
              </div>
            </div>
          </div>
        ) : (
          // На телефоне тариф — сразу под карточкой компании, а не в самом низу.
          <div className="space-y-4">
            {profileCardEl}
            {/* «Готовность к счёту» — сразу под карточкой компании. */}
            <ProfileBonusCard />
            {subscriptionEl}
            {companyEl}
            {documentsEl}
            {accountEl}
            {helpEl}
            {adminEl}
            {themeEl}
            {signOutEl}
            {deleteAccountEl}
          </div>
        )}
      </PageContainer>

      <AnimatePresence>
        {deleteModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30"
            onClick={closeDeleteModal}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ duration: 0.25, ease: EASE }}
              role="dialog" aria-modal="true" aria-labelledby="delete-account-title"
              className="relative nav-glass rounded-[24px] w-full max-w-sm overflow-hidden"
              style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
              onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--nav-critical)' }} />
              <div className="p-5">
                <div id="delete-account-title" className="text-base font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.deleteAccountModalTitle}</div>
                {isAdmin ? (
                  <>
                    <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>{t.deleteAccountAdminRefusal}</p>
                    <button type="button" onClick={closeDeleteModal}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold"
                      style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
                      {t.deleteAccountModalCancelButton}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm mb-3 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>{t.deleteAccountModalBody}</p>
                    <p className="text-sm mb-4 leading-relaxed font-medium" style={{ color: 'var(--nav-critical)' }}>{t.deleteAccountModalLossWarning}</p>
                    <label className="block mb-4">
                      <span className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--nav-text-muted)' }}>
                        {t.deleteAccountModalConfirmLabel(DELETE_CONFIRM_PHRASE)}
                      </span>
                      <input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
                        placeholder={DELETE_CONFIRM_PHRASE} disabled={deleting} autoFocus
                        autoCapitalize="characters" autoComplete="off" spellCheck={false}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                        style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border-soft)' }} />
                    </label>
                    {deleteError && (
                      <div role="alert" className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>{deleteError}</div>
                    )}
                    <div className="flex gap-2">
                      <button type="button" onClick={closeDeleteModal} disabled={deleting}
                        className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40"
                        style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}>
                        {t.deleteAccountModalCancelButton}
                      </button>
                      <button type="button" onClick={deleteAccount} disabled={!confirmMatches || deleting}
                        className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                        style={{ background: 'var(--nav-critical)' }}>
                        {deleting ? t.deleteAccountModalDeletingLabel : t.deleteAccountModalConfirmButton}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  )
}
