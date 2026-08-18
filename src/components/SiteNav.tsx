'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage, type Lang } from './LanguageProvider'

const labels: Record<Lang, { home: string; invoices: string; kaspiShop: string; aiAgent: string; kaspiApi: string; profile: string; history: string }> = {
  ru: { home: 'Главная', invoices: 'Счета', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi API', profile: 'Профиль', history: 'История' },
  kk: { home: 'Басты бет', invoices: 'Шоттар', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi API', profile: 'Профиль', history: 'Тарих' },
  en: { home: 'Home', invoices: 'Invoices', kaspiShop: 'Kaspi Bot', aiAgent: 'AI Agent', kaspiApi: 'Kaspi API', profile: 'Profile', history: 'History' },
}

// Copy shown to non-admins when they interact with an admin-gated section
// that's visible but not yet open to everyone (see isAdmin gating below).
const lockedMessages: Record<Lang, string> = {
  ru: 'Скоро откроем всем',
  kk: 'Жақында бәріне ашамыз',
  en: 'Coming soon for everyone',
}

type MenuKey = 'invoices' | 'kaspiShop' | 'aiAgent' | 'kaspiApi'
type LocalizedLabel = Record<Lang, string>

const invoicesLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/dashboard', label: { ru: 'Создать счёт', kk: 'Шот құру', en: 'Create invoice' } },
  { href: '/history', label: { ru: 'История', kk: 'Тарих', en: 'History' } },
  { href: '/profile/templates', label: { ru: 'Шаблоны', kk: 'Үлгілер', en: 'Templates' } },
]
// /dashboard stays in the dropdown but doesn't light Счета's underline --
// the top-level Главная button owns that route (both were underlining at once).
const invoicesActiveLinks = invoicesLinks.filter(l => l.href !== '/dashboard')

const kaspiShopLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/kaspi-shop', label: { ru: 'Демпинг', kk: 'Демпинг', en: 'Repricer' } },
  { href: '/kaspi-shop/orders', label: { ru: 'Заказы', kk: 'Тапсырыстар', en: 'Orders' } },
  { href: '/kaspi-shop/finance', label: { ru: 'Финансы', kk: 'Қаржы', en: 'Finance' } },
  { href: '/kaspi-shop/pending-products', label: { ru: 'Нераспознанные товары', kk: 'Танылмаған тауарлар', en: 'Unmatched products' } },
  { href: '/kaspi-shop/niches', label: { ru: 'Ниши', kk: 'Нишалар', en: 'Niches' } },
  { href: '/kaspi-shop/profit', label: { ru: 'Прибыль', kk: 'Пайда', en: 'Profit' } },
]

const aiAgentLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/ai-agent/review', label: { ru: 'Диалоги', kk: 'Диалогтар', en: 'Conversations' } },
  { href: '/ai-agent/settings', label: { ru: 'Настройки', kk: 'Баптаулар', en: 'Settings' } },
]

// Kaspi Pay's public payment API + webhooks, surfaced as its own product
// (previously reachable only by knowing the /profile/kaspi-pay URL).
const kaspiApiLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/profile/kaspi-pay', label: { ru: 'Подключение', kk: 'Қосылу', en: 'Setup' } },
  { href: '/profile/kaspi-pay/docs', label: { ru: 'Документация API', kk: 'API құжаттамасы', en: 'API docs' } },
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

function Dropdown({
  menuKey, label, links, dotColor, openMenu, setOpenMenu, router, path, lang,
  locked = false, lockedHintOpen = false, onLockedClick, activeLinks,
}: {
  menuKey: MenuKey
  label: string
  links: { href: string; label: LocalizedLabel }[]
  dotColor: string
  openMenu: MenuKey | null
  setOpenMenu: (key: MenuKey | null) => void
  router: ReturnType<typeof useRouter>
  path: string
  lang: Lang
  locked?: boolean
  lockedHintOpen?: boolean
  onLockedClick?: () => void
  // Routes counted for the active underline; defaults to `links`. Lets a
  // section list a route in its dropdown without claiming it as "its own"
  // when a top-level button (Главная = /dashboard) already owns that route.
  activeLinks?: { href: string }[]
}) {
  const active = !locked && isActiveSection(activeLinks ?? links, path)
  const open = !locked && openMenu === menuKey
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (locked) { onLockedClick?.(); return }
          setOpenMenu(open ? null : menuKey)
        }}
        aria-expanded={open}
        aria-disabled={locked}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
        style={{
          color: active ? 'var(--nav-text-primary)' : 'var(--nav-text-secondary)',
          background: open ? 'var(--nav-surface-glass)' : 'transparent',
          boxShadow: active ? `inset 0 -2px 0 var(--nav-accent)` : 'none',
          opacity: locked ? 0.6 : 1,
          cursor: locked ? 'not-allowed' : 'pointer',
        }}
      >
        {label}
        {locked ? (
          <LockIcon />
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {open && (
        <div
          className="nav-glass absolute top-[calc(100%+10px)] left-0 min-w-[210px] rounded-2xl p-1.5 z-20"
          style={{ boxShadow: `0 20px 44px -18px rgba(10,10,15,0.3), var(--nav-card-glow)` }}
        >
          {links.map(l => {
            const linkActive = path === l.href
            return (
              <button
                key={l.href}
                onClick={() => { setOpenMenu(null); router.push(l.href) }}
                className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  color: linkActive ? 'var(--nav-accent)' : 'var(--nav-text-secondary)',
                  background: linkActive ? 'var(--nav-accent-soft)' : 'transparent',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: linkActive ? dotColor : 'transparent' }} />
                {l.label[lang]}
              </button>
            )
          })}
        </div>
      )}
      {locked && lockedHintOpen && (
        <div
          className="nav-glass absolute top-[calc(100%+10px)] left-0 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-medium z-20"
          style={{ color: 'var(--nav-text-primary)', boxShadow: `0 20px 44px -18px rgba(10,10,15,0.3), var(--nav-card-glow)` }}
        >
          {lockedMessages[lang]}
        </div>
      )}
    </div>
  )
}

export default function SiteNav({ desktopOnly = false }: { desktopOnly?: boolean }) {
  const router = useRouter()
  const path = usePathname()
  const { lang } = useLanguage()
  const [unpaid, setUnpaid] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null)
  const [lockedHint, setLockedHint] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const lockedHintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showLockedHint(id: string) {
    setLockedHint(id)
    if (lockedHintTimeout.current) clearTimeout(lockedHintTimeout.current)
    lockedHintTimeout.current = setTimeout(() => setLockedHint(null), 2200)
  }

  useEffect(() => {
    async function loadUnpaid() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['sent', 'overdue'])
      setUnpaid(count || 0)
    }
    loadUnpaid()
  }, [path])

  useEffect(() => {
    async function loadAdmin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('logo_url, is_admin').eq('id', user.id).single()
      setIsAdmin(!!data?.is_admin)
      setLogoUrl(data?.logo_url || null)
    }
    loadAdmin()
  }, [])

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('click', onOutsideClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('click', onOutsideClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

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
            { href: '/history', label: labels[lang].history, badge: unpaid },
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

      {/* Desktop: sticky top bar */}
      <nav
        ref={navRef}
        className="hidden lg:flex items-center gap-1 sticky top-0 z-30 px-7 py-3.5 nav-glass"
        style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
      >
        <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 mr-5 flex-shrink-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="w-6 h-6 rounded-lg object-contain bg-white"
              style={{ boxShadow: '0 6px 14px -6px var(--nav-accent)' }}
            />
          ) : (
            <span
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white font-extrabold text-[10px]"
              style={{ background: `linear-gradient(135deg, var(--nav-accent), var(--nav-teal))`, boxShadow: '0 6px 14px -6px var(--nav-accent)' }}
            >
              IK
            </span>
          )}
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

        <Dropdown menuKey="invoices" label={labels[lang].invoices} links={invoicesLinks} activeLinks={invoicesActiveLinks} dotColor="var(--nav-accent)" openMenu={openMenu} setOpenMenu={setOpenMenu} router={router} path={path} lang={lang} />
        <Dropdown
          menuKey="kaspiShop" label={labels[lang].kaspiShop} links={kaspiShopLinks} dotColor="var(--nav-teal)"
          openMenu={openMenu} setOpenMenu={setOpenMenu} router={router} path={path} lang={lang}
          locked={!isAdmin} lockedHintOpen={lockedHint === 'desktop-kaspiShop'} onLockedClick={() => showLockedHint('desktop-kaspiShop')}
        />
        <Dropdown
          menuKey="aiAgent" label={labels[lang].aiAgent} links={aiAgentLinks} dotColor="var(--nav-magenta)"
          openMenu={openMenu} setOpenMenu={setOpenMenu} router={router} path={path} lang={lang}
          locked={!isAdmin} lockedHintOpen={lockedHint === 'desktop-aiAgent'} onLockedClick={() => showLockedHint('desktop-aiAgent')}
        />
        <Dropdown menuKey="kaspiApi" label={labels[lang].kaspiApi} links={kaspiApiLinks} dotColor="var(--nav-accent)" openMenu={openMenu} setOpenMenu={setOpenMenu} router={router} path={path} lang={lang} />

        {unpaid > 0 && (
          <button
            onClick={() => router.push('/history')}
            className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ background: 'rgba(239, 68, 68, 0.14)', color: '#ef4444' }}
          >
            {unpaid} неоплачен{unpaid === 1 ? 'ный' : 'ных'}
          </button>
        )}

        <div className="flex-1" />
        {/* TopUtilityBar renders its own wallet/notifications/account trigger buttons
            fixed at lg:top-3 right-3 (see Task 5) — visually aligned with this bar's
            height, intentionally not rendered inside this <nav> to avoid touching its
            working fetch/panel logic in this phase. */}
      </nav>
    </>
  )
}
