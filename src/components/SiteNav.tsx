'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from './LanguageProvider'

const labels: Record<'ru' | 'kk' | 'en', { home: string; invoices: string; kaspiShop: string; aiAgent: string; profile: string; history: string }> = {
  ru: { home: 'Главная', invoices: 'Счета', kaspiShop: 'Kaspi Магазин', aiAgent: 'AI-агент', profile: 'Профиль', history: 'История' },
  kk: { home: 'Басты бет', invoices: 'Шоттар', kaspiShop: 'Kaspi Дүкені', aiAgent: 'AI-агент', profile: 'Профиль', history: 'Тарих' },
  en: { home: 'Home', invoices: 'Invoices', kaspiShop: 'Kaspi Shop', aiAgent: 'AI Agent', profile: 'Profile', history: 'History' },
}

type MenuKey = 'invoices' | 'kaspiShop' | 'aiAgent'

const invoicesLinks = [
  { href: '/dashboard', label: 'Создать счёт' },
  { href: '/history', label: 'История' },
  { href: '/profile/templates', label: 'Шаблоны' },
]

const kaspiShopLinks = [
  { href: '/kaspi-shop', label: 'Демпинг' },
  { href: '/kaspi-shop/orders', label: 'Заказы' },
  { href: '/kaspi-shop/finance', label: 'Финансы' },
  { href: '/kaspi-shop/pending-products', label: 'Нераспознанные товары' },
  { href: '/kaspi-shop/niches', label: 'Ниши' },
  { href: '/kaspi-shop/profit', label: 'Прибыль' },
]

const aiAgentLinks = [
  { href: '/ai-agent/review', label: 'Диалоги' },
  { href: '/ai-agent/settings', label: 'Настройки' },
]

export default function SiteNav({ desktopOnly = false }: { desktopOnly?: boolean }) {
  const router = useRouter()
  const path = usePathname()
  const { lang } = useLanguage()
  const [unpaid, setUnpaid] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null)
  const navRef = useRef<HTMLElement>(null)

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
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      setIsAdmin(!!data?.is_admin)
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

  function isActiveSection(links: { href: string }[]) {
    return links.some(l => path === l.href || path.startsWith(l.href + '/'))
  }

  function Dropdown({ menuKey, label, links, dotClass }: { menuKey: MenuKey; label: string; links: { href: string; label: string }[]; dotClass: string }) {
    const active = isActiveSection(links)
    const open = openMenu === menuKey
    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpenMenu(open ? null : menuKey) }}
          aria-expanded={open}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{
            color: active ? 'var(--nav-text-primary)' : 'var(--nav-text-secondary)',
            background: open ? 'var(--nav-surface-glass)' : 'transparent',
            boxShadow: active ? `inset 0 -2px 0 var(--nav-accent)` : 'none',
          }}
        >
          {label}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: linkActive ? dotClass : 'transparent' }} />
                  {l.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Mobile: bottom icon bar — same fixed position/behavior as the old AppNav bottom bar, restyled */}
      {!desktopOnly && (
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 flex z-40 nav-glass"
          style={{ borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}
        >
          {[
            { href: '/dashboard', label: labels[lang].home },
            { href: '/history', label: labels[lang].history, badge: unpaid },
            { href: '/profile', label: labels[lang].profile },
            ...(isAdmin ? [{ href: '/kaspi-shop', label: labels[lang].kaspiShop }] : []),
            ...(isAdmin ? [{ href: '/ai-agent/settings', label: labels[lang].aiAgent }] : []),
          ].map(item => {
            const active = path === item.href || path.startsWith(item.href + '/')
            return (
              <button key={item.href} onClick={() => router.push(item.href)} className="flex-1 flex flex-col items-center py-3 gap-1 relative">
                <div className="w-2 h-2 rounded-full" style={{ background: active ? 'var(--nav-accent)' : 'var(--nav-text-muted)', opacity: active ? 1 : 0.4 }} />
                {'badge' in item && item.badge ? (
                  <div className="absolute -top-0.5 right-[calc(50%-18px)] bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium">
                    {item.badge > 9 ? '9+' : item.badge}
                  </div>
                ) : null}
                <span className="text-[11px]" style={{ color: active ? 'var(--nav-text-primary)' : 'var(--nav-text-muted)', fontWeight: active ? 600 : 400 }}>
                  {item.label}
                </span>
              </button>
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
          <span
            className="w-6 h-6 rounded-lg flex items-center justify-center text-white font-extrabold text-[10px]"
            style={{ background: `linear-gradient(135deg, var(--nav-accent), var(--nav-teal))`, boxShadow: '0 6px 14px -6px var(--nav-accent)' }}
          >
            IK
          </span>
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

        <Dropdown menuKey="invoices" label={labels[lang].invoices} links={invoicesLinks} dotClass="var(--nav-accent)" />
        {isAdmin && <Dropdown menuKey="kaspiShop" label={labels[lang].kaspiShop} links={kaspiShopLinks} dotClass="var(--nav-teal)" />}
        {isAdmin && <Dropdown menuKey="aiAgent" label={labels[lang].aiAgent} links={aiAgentLinks} dotClass="var(--nav-magenta)" />}

        {unpaid > 0 && (
          <button
            onClick={() => router.push('/history')}
            className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ background: 'var(--nav-magenta-soft)', color: 'var(--nav-magenta)' }}
          >
            {unpaid} неоплачен{unpaid === 1 ? 'ный' : unpaid < 5 ? 'ных' : 'ных'}
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
