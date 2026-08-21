'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage, type Lang } from './LanguageProvider'
import KaspiShopStoreSwitcher from './KaspiShopStoreSwitcher'

const labels: Record<Lang, { home: string; invoices: string; kaspiShop: string; aiAgent: string; kaspiApi: string; profile: string; history: string }> = {
  ru: { home: 'Дашборд', invoices: 'Счета', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi API', profile: 'Профиль', history: 'История' },
  kk: { home: 'Дашборд', invoices: 'Шоттар', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi API', profile: 'Профиль', history: 'Тарих' },
  en: { home: 'Dashboard', invoices: 'Invoices', kaspiShop: 'Kaspi Bot', aiAgent: 'AI Agent', kaspiApi: 'Kaspi API', profile: 'Profile', history: 'History' },
}

// Copy shown to non-admins when they interact with an admin-gated section
// that's visible but not yet open to everyone (see isAdmin gating below).
const lockedMessages: Record<Lang, string> = {
  ru: 'Скоро откроем всем',
  kk: 'Жақында бәріне ашамыз',
  en: 'Coming soon for everyone',
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
  { href: '/kaspi-shop/finance', label: { ru: 'Финансы', kk: 'Қаржы', en: 'Finance' } },
  { href: '/kaspi-shop/pending-products', label: { ru: 'Нераспознанные товары', kk: 'Танылмаған тауарлар', en: 'Unmatched products' } },
  { href: '/kaspi-shop/niches', label: { ru: 'Ниши', kk: 'Нишалар', en: 'Niches' } },
  { href: '/kaspi-shop/profit', label: { ru: 'Прибыль', kk: 'Пайда', en: 'Profit' } },
  { href: '/kaspi-shop/margin', label: { ru: 'Калькулятор маржи', kk: 'Маржа калькуляторы', en: 'Margin calculator' } },
  { href: '/kaspi-shop/reviews', label: { ru: 'Отзывы', kk: 'Пікірлер', en: 'Reviews' } },
  { href: '/kaspi-shop/nkt', label: { ru: 'Каталог НКТ', kk: 'ҰТК каталогы', en: 'NKT catalog' } },
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

// Second-row sub-navigation (2026-08-20, founder: dropdowns were "тяжело
// выбирать" -- replaced with a persistent second tab row that stays open on
// every page of the active section, MoonAI/NestedTabs-style). Each section:
// a top-level button (click = go to the section's first page) + its links
// rendered as pill tabs in a second bar whenever the current path belongs
// to the section.
type Section = {
  key: 'invoices' | 'kaspiApi' | 'kaspiShop' | 'aiAgent'
  links: { href: string; label: LocalizedLabel }[]
  adminOnly: boolean
}

const SECTIONS: Section[] = [
  { key: 'invoices', links: invoicesLinks, adminOnly: false },
  { key: 'kaspiApi', links: kaspiApiLinks, adminOnly: false },
  { key: 'kaspiShop', links: kaspiShopLinks, adminOnly: true },
  { key: 'aiAgent', links: aiAgentLinks, adminOnly: true },
]

function LockIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
  const [lockedHint, setLockedHint] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const lockedHintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showLockedHint(id: string) {
    setLockedHint(id)
    if (lockedHintTimeout.current) clearTimeout(lockedHintTimeout.current)
    lockedHintTimeout.current = setTimeout(() => setLockedHint(null), 2200)
  }

  useEffect(() => {
    async function loadAdmin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      setIsAdmin(!!data?.is_admin)
    }
    loadAdmin()
  }, [])

  // The section the current path belongs to -- its links become the second
  // tab row. /dashboard belongs to no section (top-level Дашборд owns it),
  // so the second row simply doesn't render there.
  const activeSection = SECTIONS.find(s => isActiveSection(s.links, path)) || null

  return (
    <>
      {/* Mobile: bottom icon bar — same fixed position/behavior as the old AppNav bottom bar, restyled */}
      {!desktopOnly && (
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 flex z-40 nav-glass"
          style={{ borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}
        >
          {([
            { href: '/dashboard', label: labels[lang].home },
            { href: '/history', label: labels[lang].history },
            { href: '/profile', label: labels[lang].profile },
            { href: '/kaspi-shop', label: labels[lang].kaspiShop, locked: !isAdmin, hintId: 'mobile-kaspiShop' },
            { href: '/ai-agent/settings', label: labels[lang].aiAgent, locked: !isAdmin, hintId: 'mobile-aiAgent' },
          ] as { href: string; label: string; badge?: number; locked?: boolean; hintId?: string }[]).map(item => {
            const active = !item.locked && (path === item.href || path.startsWith(item.href + '/'))
            return (
              <div key={item.href} className="relative flex-1">
                <button
                  onClick={() => {
                    if (item.locked) { showLockedHint(item.hintId!); return }
                    router.push(item.href)
                  }}
                  aria-disabled={item.locked}
                  className="w-full flex flex-col items-center py-3 gap-1"
                  style={{ opacity: item.locked ? 0.6 : 1, cursor: item.locked ? 'not-allowed' : 'pointer' }}
                >
                  <div className="relative flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full" style={{ background: active ? 'var(--nav-accent)' : 'var(--nav-text-muted)', opacity: active ? 1 : 0.4 }} />
                    {item.locked && (
                      <span className="absolute -top-1.5 -right-2.5" style={{ color: 'var(--nav-text-muted)' }}>
                        <LockIcon size={9} />
                      </span>
                    )}
                  </div>
                  {item.badge ? (
                    <div className="absolute -top-0.5 right-[calc(50%-18px)] bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium">
                      {item.badge > 9 ? '9+' : item.badge}
                    </div>
                  ) : null}
                  <span className="text-[11px]" style={{ color: active ? 'var(--nav-text-primary)' : 'var(--nav-text-muted)', fontWeight: active ? 600 : 400 }}>
                    {item.label}
                  </span>
                </button>
                {item.locked && lockedHint === item.hintId && (
                  <div
                    className="nav-glass absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-medium z-20"
                    style={{ color: 'var(--nav-text-primary)' }}
                  >
                    {lockedMessages[lang]}
                  </div>
                )}
              </div>
            )
          })}
        </div>
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
            const locked = s.adminOnly && !isAdmin
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
                    {lockedMessages[lang]}
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
          <div className="flex items-center gap-1.5 px-7 pb-2.5 -mt-1 overflow-x-auto">
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
