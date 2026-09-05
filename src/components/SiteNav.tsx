'use client'
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { useLanguage, type Lang } from './LanguageProvider'
import KaspiShopStoreSwitcher from './KaspiShopStoreSwitcher'

const labels: Record<Lang, { home: string; invoices: string; kaspiShop: string; aiAgent: string; kaspiApi: string; wildberries: string; profile: string; menu: string; close: string }> = {
  ru: { home: 'Дашборд', invoices: 'Счета', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi Cashier API', wildberries: 'WB Bot', profile: 'Профиль', menu: 'Меню', close: 'Закрыть' },
  kk: { home: 'Дашборд', invoices: 'Шоттар', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi Cashier API', wildberries: 'WB Bot', profile: 'Профиль', menu: 'Мәзір', close: 'Жабу' },
  en: { home: 'Dashboard', invoices: 'Invoices', kaspiShop: 'Kaspi Bot', aiAgent: 'AI Agent', kaspiApi: 'Kaspi Cashier API', wildberries: 'WB Bot', profile: 'Profile', menu: 'Menu', close: 'Close' },
}

// Copy shown to non-admins when they interact with an admin-gated section
// that's visible but not yet open to everyone (see isAdmin gating below).
const lockedMessages: Record<Lang, string> = {
  ru: 'Скоро откроем всем',
  kk: 'Жақында бәріне ашамыз',
  en: 'Coming soon for everyone',
}

// Copy for a proOnly section (2026-09-02, AI-агент) -- unlike the admin-gated
// sections above, this one is already live for real customers; a Free/Basic
// user hitting the lock needs a plan upsell, not a "coming soon" message
// that would be simply false for them.
const proLockedMessages: Record<Lang, string> = {
  ru: 'Доступно на тарифе Про',
  kk: 'Про тарифінде қолжетімді',
  en: 'Available on the Pro plan',
}

type LocalizedLabel = Record<Lang, string>

const invoicesLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/create', label: { ru: 'Создать счёт', kk: 'Шот құру', en: 'Create invoice' } },
  { href: '/history', label: { ru: 'История', kk: 'Тарих', en: 'History' } },
  { href: '/profile/templates', label: { ru: 'Шаблоны', kk: 'Үлгілер', en: 'Templates' } },
]

const kaspiShopLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/kaspi-shop', label: { ru: 'Демпинг', kk: 'Демпинг', en: 'Repricer' } },
  { href: '/kaspi-shop/orders', label: { ru: 'Заказы', kk: 'Тапсырыстар', en: 'Orders' } },
  { href: '/kaspi-shop/refunds', label: { ru: 'Возвраты', kk: 'Қайтарулар', en: 'Refunds' } },
  { href: '/kaspi-shop/finance', label: { ru: 'Финансы', kk: 'Қаржы', en: 'Finance' } },
  { href: '/kaspi-shop/pending-products', label: { ru: 'Нераспознанные товары', kk: 'Танылмаған тауарлар', en: 'Unmatched products' } },
  { href: '/kaspi-shop/removed', label: { ru: 'Управление товарами', kk: 'Тауарларды басқару', en: 'Product management' } },
  { href: '/kaspi-shop/niches', label: { ru: 'Ниши', kk: 'Нишалар', en: 'Niches' } },
  { href: '/kaspi-shop/profit', label: { ru: 'Прибыль', kk: 'Пайда', en: 'Profit' } },
  { href: '/kaspi-shop/margin', label: { ru: 'Калькулятор маржи', kk: 'Маржа калькуляторы', en: 'Margin calculator' } },
  { href: '/kaspi-shop/reviews', label: { ru: 'Отзывы', kk: 'Пікірлер', en: 'Reviews' } },
  { href: '/kaspi-shop/quality', label: { ru: 'Качество', kk: 'Сапа', en: 'Quality' } },
  { href: '/kaspi-shop/nkt', label: { ru: 'Каталог НКТ', kk: 'ҰТК каталогы', en: 'NKT catalog' } },
  { href: '/kaspi-shop/storefront', label: { ru: 'Витрина', kk: 'Витрина', en: 'Storefront' } },
  { href: '/kaspi-shop/storefront-orders', label: { ru: 'Заказы витрины', kk: 'Витрина тапсырыстары', en: 'Storefront orders' } },
]

// /ai-agent/settings deliberately has no pill of its own here -- it only
// ever makes sense scoped to one already-chosen agent (?agent=<id>, reached
// by clicking an agent card on "Агенты"), so it's not a standalone
// destination. Its path still falls under this section (prefix-matches
// '/ai-agent'), so "Агенты" is what lights up while on it -- exactly the
// parent it drills down from.
const aiAgentLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/ai-agent', label: { ru: 'Агенты', kk: 'Агенттер', en: 'Agents' } },
  { href: '/ai-agent/review', label: { ru: 'Диалоги', kk: 'Диалогтар', en: 'Conversations' } },
  { href: '/ai-agent/dialogs', label: { ru: 'Переписка', kk: 'Хат алмасу', en: 'Correspondence' } },
  { href: '/ai-agent/test-chat', label: { ru: 'Тестовый чат', kk: 'Сынақ чаты', en: 'Test chat' } },
  { href: '/ai-agent/broadcasts', label: { ru: 'Рассылки', kk: 'Таратылымдар', en: 'Broadcasts' } },
  { href: '/ai-agent/leads', label: { ru: 'Заявки', kk: 'Өтінімдер', en: 'Leads' } },
  { href: '/ai-agent/analytics', label: { ru: 'Аналитика', kk: 'Аналитика', en: 'Analytics' } },
  { href: '/ai-agent/docs', label: { ru: 'Как настроить', kk: 'Қалай баптау керек', en: 'Setup guide' } },
]

// Kaspi Pay's public payment API + webhooks, surfaced as its own standalone
// section (2026-08-19: moved out from under /profile to /kaspi-api, same as
// Kaspi Bot and AI-агент).
const kaspiApiLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/kaspi-api', label: { ru: 'Подключение', kk: 'Қосылу', en: 'Setup' } },
  { href: '/kaspi-api/docs', label: { ru: 'Документация API', kk: 'API құжаттамасы', en: 'API docs' } },
]

const wbLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/wildberries', label: { ru: 'Подключение', kk: 'Қосылу', en: 'Connect' } },
  { href: '/wildberries/products', label: { ru: 'Товары', kk: 'Тауарлар', en: 'Products' } },
  { href: '/wildberries/orders', label: { ru: 'Заказы', kk: 'Тапсырыстар', en: 'Orders' } },
]

// Second-row sub-navigation (2026-08-20, founder: dropdowns were "тяжело
// выбирать" -- replaced with a persistent second tab row that stays open on
// every page of the active section, MoonAI/NestedTabs-style). Each section:
// a top-level button (click = go to the section's first page) + its links
// rendered as pill tabs in a second bar whenever the current path belongs
// to the section.
type Section = {
  key: 'invoices' | 'kaspiApi' | 'kaspiShop' | 'aiAgent' | 'wildberries'
  links: { href: string; label: LocalizedLabel }[]
  adminOnly: boolean
  // Unlocked for an active Pro plan too, not just admins (2026-09-02
  // AI-агент, 2026-09-03 Kaspi Bot) -- only meaningful when adminOnly is
  // false. wildberries stays admin-only until the founder reviews it the
  // same way these two were before this.
  proOnly?: boolean
}

const SECTIONS: Section[] = [
  { key: 'invoices', links: invoicesLinks, adminOnly: false },
  { key: 'kaspiApi', links: kaspiApiLinks, adminOnly: false },
  { key: 'aiAgent', links: aiAgentLinks, adminOnly: false, proOnly: true },
  { key: 'kaspiShop', links: kaspiShopLinks, adminOnly: false, proOnly: true },
  { key: 'wildberries', links: wbLinks, adminOnly: true },
]

function isSectionLocked(s: Section, isAdmin: boolean, isPro: boolean): boolean {
  if (s.adminOnly) return !isAdmin
  if (s.proOnly) return !(isAdmin || isPro)
  return false
}

function LockIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// Same mark the profile-section headers use (e.g. profile/banks/page.tsx) --
// duplicated locally rather than shared, matching how LockIcon/CloseIcon
// are already declared in this file.
function ChevronLeftIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

function ChevronRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function isActiveSection(links: { href: string }[], path: string) {
  return links.some(l => path === l.href || path.startsWith(l.href + '/'))
}

export default function SiteNav({ desktopOnly = false }: { desktopOnly?: boolean }) {
  const router = useRouter()
  const path = usePathname()
  const { lang } = useLanguage()
  const [isAdmin, setIsAdmin] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [lockedHint, setLockedHint] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Gates the drawer's createPortal call below -- document.body doesn't
  // exist during SSR, so the portal target is only safe to touch once the
  // client has actually mounted.
  const [mounted, setMounted] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const lockedHintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showLockedHint(id: string) {
    setLockedHint(id)
    if (lockedHintTimeout.current) clearTimeout(lockedHintTimeout.current)
    lockedHintTimeout.current = setTimeout(() => setLockedHint(null), 2200)
  }

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    async function loadAdmin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      setIsAdmin(!!data?.is_admin)
      setIsPro(getActivePlan(data).canAiAgent)
    }
    loadAdmin()
  }, [])

  // Drawer follows navigation: any route change closes it.
  useEffect(() => { setDrawerOpen(false) }, [path])

  // While the drawer is open the page behind must not scroll, and Escape closes.
  useEffect(() => {
    if (!drawerOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  // The section the current path belongs to -- its links become the second
  // tab row. /dashboard belongs to no section (top-level Дашборд owns it),
  // so the second row simply doesn't render there.
  const activeSection = SECTIONS.find(s => isActiveSection(s.links, path)) || null

  return (
    <>
      {/* Mobile: sticky top bar. STICKY, NOT FIXED -- a fixed bar would need
          padding-top on the ~74 pages that render <SiteNav />, which is the
          exact sweep this project reverted twice in August (2a1cb30, 481cdc7
          -> c7ea68b). Sticky rides normal flow, pushes content down by
          itself, and needs no page-level change; the desktop row below does
          the same thing. h-14 (56px) is sized so TopUtilityBar's 44px pill
          centres inside it at top-1.5. */}
      {!desktopOnly && (
        <div
          className="lg:hidden sticky top-0 z-40 h-14 flex items-center px-2 nav-glass"
          style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label={labels[lang].menu}
            className="w-11 h-11 flex items-center justify-center rounded-xl transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-text-primary)' }}
          >
            <ChevronLeftIcon />
          </button>
        </div>
      )}

      {/* Mobile: left slide-in drawer with the full section tree. Portaled
          straight to document.body rather than rendered in place: every app
          page wraps <SiteNav /> in <main className="page-surface-in-shell">
          (see dashboard/page.tsx), and that class puts backdrop-filter on
          <main> (globals.css). In WebKit (iOS Safari -- invisible in
          Chromium, which doesn't apply this rule) an element with
          backdrop-filter becomes BOTH the containing block for `position:
          fixed` descendants AND a new stacking context. Left in place, this
          drawer's `fixed inset-0` measured against <main> (thousands of px
          tall) instead of the viewport, rendering off-screen at any scroll
          offset, and its z-[60] was trapped inside <main>'s stacking
          context -- losing to TopUtilityBar's z-50 pill, which renders
          outside <main> at the root layout. The close button hit-tested to
          that pill instead, opening the wallet panel rather than closing
          the drawer. Raising the drawer's z-index doesn't fix either
          problem: it's a containing-block/stacking-context issue, not a
          z-order one. `mounted` just keeps this off the server, where
          document.body doesn't exist yet. */}
      {!desktopOnly && mounted && createPortal(
        <AnimatePresence>
          {drawerOpen && (
            <div className="lg:hidden fixed inset-0 z-[60]">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 bg-black/30"
                onClick={() => setDrawerOpen(false)}
              />
              <motion.div
                role="dialog" aria-modal="true" aria-label={labels[lang].menu}
                initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                className="absolute top-0 bottom-0 left-0 w-[290px] max-w-[85vw] nav-glass flex flex-col"
                style={{ borderTop: 'none', borderBottom: 'none', borderLeft: 'none' }}
              >
                <div className="flex items-center gap-2 px-4 pt-4 pb-2 flex-shrink-0">
                  <img src="/icon.svg" alt="" className="w-6 h-6 rounded-lg" style={{ boxShadow: '0 6px 14px -6px var(--nav-accent)' }} />
                  <span className="font-semibold text-sm flex-1" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>invoices.kz</span>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    aria-label={labels[lang].close}
                    className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg"
                    style={{ color: 'var(--nav-text-secondary)' }}
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-6">
                  {([
                    { href: '/dashboard', label: labels[lang].home },
                    { href: '/profile', label: labels[lang].profile },
                  ]).map(item => {
                    const active = path === item.href || path.startsWith(item.href + '/')
                    return (
                      <button
                        key={item.href}
                        onClick={() => { setDrawerOpen(false); router.push(item.href) }}
                        className="w-full min-h-[44px] flex items-center px-3 rounded-xl text-sm font-semibold text-left"
                        style={{
                          color: active ? 'var(--nav-text-primary)' : 'var(--nav-text-secondary)',
                          background: active ? 'var(--nav-surface-glass)' : 'transparent',
                        }}
                      >
                        {item.label}
                      </button>
                    )
                  })}

                  {SECTIONS.map(s => {
                    const locked = isSectionLocked(s, isAdmin, isPro)
                    // Mirrors the desktop row above: tapping a header jumps to
                    // that section's first page rather than toggling a local
                    // open/closed flag -- the founder moved the desktop nav
                    // away from dropdown-style reveal-on-click back on
                    // 2026-08-20 specifically because it was "тяжело выбирать",
                    // so the drawer stays consistent with that rather than
                    // reintroducing it here. Only whichever section the current
                    // route actually belongs to ever renders its sub-items.
                    const active = !locked && activeSection?.key === s.key
                    return (
                      <div key={s.key} className="mt-3">
                        {/* Was an 11px uppercase muted "divider label" back when
                            it was decorative. fe3853f made it navigable but left
                            that styling, so on a phone the drawer read as empty
                            (founder, 2026-09-05) -- a header that does something
                            has to look like the rows above it. */}
                        <button
                          type="button"
                          onClick={() => {
                            if (locked) { showLockedHint(`drawer-${s.key}`); return }
                            setDrawerOpen(false)
                            router.push(s.links[0].href)
                          }}
                          aria-disabled={locked}
                          className="w-full min-h-[44px] flex items-center gap-1.5 px-3 rounded-xl text-sm font-semibold text-left"
                          style={{ color: active ? 'var(--nav-text-primary)' : 'var(--nav-text-secondary)', cursor: locked ? 'not-allowed' : 'pointer' }}
                        >
                          <span className="flex-1 truncate">{labels[lang][s.key]}</span>
                          {locked ? <LockIcon size={13} /> : <ChevronRightIcon />}
                        </button>
                        {locked ? (
                          lockedHint === `drawer-${s.key}` && (
                            <div className="px-3 pb-1.5 text-xs font-medium" style={{ color: 'var(--nav-text-secondary)' }}>
                              {s.proOnly ? proLockedMessages[lang] : lockedMessages[lang]}
                            </div>
                          )
                        ) : active && (
                          s.links.map(l => {
                            const bestMatch = s.links
                              .filter(x => path === x.href || path.startsWith(x.href + '/'))
                              .sort((a, b) => b.href.length - a.href.length)[0]?.href
                            const linkActive = l.href === bestMatch
                            return (
                              <button
                                key={l.href}
                                onClick={() => { setDrawerOpen(false); router.push(l.href) }}
                                className="w-full min-h-[44px] flex items-center px-3 rounded-xl text-sm text-left"
                                style={{
                                  color: linkActive ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
                                  background: linkActive ? 'var(--nav-accent)' : 'transparent',
                                  fontWeight: linkActive ? 600 : 400,
                                }}
                              >
                                {l.label[lang]}
                              </button>
                            )
                          })
                        )}
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Desktop: sticky top bar (row 1: sections, row 2: active section's pages) */}
      <nav
        ref={navRef}
        className="hidden lg:block sticky top-0 z-30 nav-glass"
        style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
      >
        <div className="flex items-center gap-1 px-7 py-3.5">
          {/* Always the invoices.kz brand mark here (2026-08-19, founder:
              "тут надо поставить лого invoices.kz") -- /icon.svg is the
              same IK mark used for the favicon/PWA icons. */}
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 mr-5 flex-shrink-0">
            <img
              src="/icon.svg"
              alt=""
              className="w-6 h-6 rounded-lg"
              style={{ boxShadow: '0 6px 14px -6px var(--nav-accent)' }}
            />
            <span className="font-semibold text-sm" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>invoices.kz</span>
          </button>

          <button
            onClick={() => router.push('/dashboard')}
            className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              color: path === '/dashboard' ? 'var(--nav-text-primary)' : 'var(--nav-text-secondary)',
              boxShadow: path === '/dashboard' ? `inset 0 -2px 0 var(--nav-accent)` : 'none',
            }}
          >
            {labels[lang].home}
          </button>

          {SECTIONS.map(s => {
            const locked = isSectionLocked(s, isAdmin, isPro)
            const active = !locked && activeSection?.key === s.key
            return (
              <div key={s.key} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (locked) { showLockedHint(`desktop-${s.key}`); return }
                    router.push(s.links[0].href)
                  }}
                  aria-disabled={locked}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    color: active ? 'var(--nav-text-primary)' : 'var(--nav-text-secondary)',
                    boxShadow: active ? `inset 0 -2px 0 var(--nav-accent)` : 'none',
                    opacity: locked ? 0.6 : 1,
                    cursor: locked ? 'not-allowed' : 'pointer',
                  }}
                >
                  {labels[lang][s.key]}
                  {locked && <LockIcon />}
                </button>
                {locked && lockedHint === `desktop-${s.key}` && (
                  <div
                    className="nav-glass absolute top-[calc(100%+10px)] left-0 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-medium z-20"
                    style={{ color: 'var(--nav-text-primary)', boxShadow: `0 20px 44px -18px rgba(10,10,15,0.3), var(--nav-card-glow)` }}
                  >
                    {s.proOnly ? proLockedMessages[lang] : lockedMessages[lang]}
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex-1" />
          {/* TopUtilityBar renders its own wallet/notifications/account trigger
              buttons fixed at lg:top-[21px] right-6 — aligned with THIS first
              row's height; intentionally not rendered inside this <nav>. */}
        </div>

        {/* Row 2: the active section's pages as persistent pill tabs. Stays
            visible on every page of the section (no dropdown to reopen). */}
        {activeSection && (
          <div className="flex items-center gap-1.5 px-7 pb-2.5 -mt-1">
            {/* overflow-x-auto lives on this inner wrapper, not the row --
                setting it on the row clipped KaspiShopStoreSwitcher's dropdown
                too (an ancestor with overflow-x set implicitly gets
                overflow-y: auto/clipped as well per the CSS spec), cutting it
                off instead of letting it float over the page (founder,
                screenshot 2026-08-21: dropdown showed clipped inside the row). */}
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
            {(() => {
              // Longest matching href wins -- otherwise a section root like
              // /ai-agent prefix-matches every page of the section and two
              // pills light up at once.
              const bestMatch = activeSection.links
                .filter(l => path === l.href || path.startsWith(l.href + '/'))
                .sort((a, b) => b.href.length - a.href.length)[0]?.href
              return activeSection.links.map(l => {
              const linkActive = l.href === bestMatch
              return (
                <button
                  key={l.href}
                  onClick={() => router.push(l.href)}
                  className="relative px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap flex-shrink-0 transition-colors"
                  style={{
                    color: linkActive ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
                  }}
                >
                  {linkActive && (
                    <motion.span
                      layoutId="siteNavSubTab"
                      className="absolute inset-0 rounded-full"
                      style={{ background: 'var(--nav-accent)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    />
                  )}
                  <span className="relative">{l.label[lang]}</span>
                </button>
              )
            })
            })()}
            </div>
            {/* Founder, 2026-08-21: "какая компания" wasn't visible anywhere
                on Kaspi Bot pages, plus a real need for switching between the
                2 real Kaspi merchant accounts on one phone number -- placed
                here (sub-nav row, right side) since it's directly under
                TopUtilityBar's wallet pill in row 1. */}
            {activeSection.key === 'kaspiShop' && <KaspiShopStoreSwitcher />}
          </div>
        )}
      </nav>
    </>
  )
}
