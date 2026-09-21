'use client'
import { useEffect, useRef, useState } from 'react'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { SECTIONS } from '@/components/SiteNav'
import KaspiShopStoreSwitcher, { type StoreState } from '@/components/KaspiShopStoreSwitcher'
import { ShellContext } from '@/components/shellContext'
import { supabase } from '@/lib/supabase'
import { PRODUCTS, SELECTABLE_KEYS, type ProductKey } from '@/lib/products'
import { productCabinetHref } from '@/lib/crossProduct'
import { useEffectivePath } from '@/lib/useEffectivePath'
import { useMyProducts } from '@/lib/useMyProducts'

const TEXT: Record<Lang, { all: string; menu: string; close: string; balance: string; topup: string; connected: string; notConnected: string; notifications: string; help: string; account: string }> = {
  ru: { all: 'Все продукты', menu: 'Меню', close: 'Закрыть', balance: 'Баланс', topup: 'Пополнить баланс', connected: 'Магазин подключён', notConnected: 'Магазин не подключён', notifications: 'Уведомления', help: 'Помощь', account: 'Аккаунт' },
  kk: { all: 'Барлық өнімдер', menu: 'Мәзір', close: 'Жабу', balance: 'Баланс', topup: 'Балансты толтыру', connected: 'Дүкен қосылған', notConnected: 'Дүкен қосылмаған', notifications: 'Хабарландырулар', help: 'Көмек', account: 'Аккаунт' },
  en: { all: 'All products', menu: 'Menu', close: 'Close', balance: 'Balance', topup: 'Top up balance', connected: 'Store connected', notConnected: 'Store not connected', notifications: 'Notifications', help: 'Help', account: 'Account' },
}

function openUtility(panel: 'notifications' | 'help' | 'account') {
  window.dispatchEvent(new CustomEvent('open-utility-panel', { detail: { panel } }))
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Cabinet layout from the founder's mock (21.09.2026): a left sidebar with only
// this product's sections and a product switcher on top. The pages themselves are
// unchanged -- they render inside; <SiteNav /> renders nothing here.
export default function ProductShell({ product, children }: { product: ProductKey; children: React.ReactNode }) {
  const { lang } = useLanguage()
  const path = useEffectivePath()
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [storeState, setStoreState] = useState<StoreState>('loading')
  const [balance, setBalance] = useState<number | null>(null)
  const [util, setUtil] = useState<{ unread: number; initials: string }>({ unread: 0, initials: '··' })
  const [mine] = useMyProducts()
  const [hostname] = useState(() => (typeof window === 'undefined' ? '' : window.location.hostname))
  const switchRef = useRef<HTMLDivElement>(null)
  const t = TEXT[lang]

  const def = PRODUCTS.find((p) => p.key === product)!
  const section = SECTIONS.find((s) => s.key === product)
  const links = section?.links ?? []
  const bestMatch = links
    .filter((l) => path === l.href || path.startsWith(l.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const switchable = PRODUCTS.filter((p) => !p.locked && p.key !== 'salon' && (mine === null ? SELECTABLE_KEYS.includes(p.key) : mine.includes(p.key) || p.key === product))

  // The top pill drops its own balance button while a shell is on screen (CSS keys off this class).
  useEffect(() => {
    document.body.classList.add('product-shell-active')
    return () => document.body.classList.remove('product-shell-active')
  }, [])

  // Wallet balance for the sidebar (same source as the top pill's wallet).
  useEffect(() => {
    let alive = true
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/kaspi/wallet', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!res.ok) return
      const data = await res.json()
      if (alive && Number.isFinite(Number(data.balance))) setBalance(Number(data.balance))
    }
    void load()
    return () => { alive = false }
  }, [])

  // Bell badge and initials come from the top bar component (it owns the data).
  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<{ unread: number; initials: string }>).detail
      if (d) setUtil({ unread: d.unread, initials: d.initials })
    }
    window.addEventListener('utility-bar-state', onState)
    window.dispatchEvent(new Event('utility-bar-request'))
    return () => window.removeEventListener('utility-bar-state', onState)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  // Kaspi Bot gets a live status dot: green and pulsing while the store is connected.
  const dotState = product === 'kaspiShop' ? (storeState === 'connected' ? 'connected' : storeState === 'loading' ? 'loading' : 'off') : 'product'
  const dotTitle = product === 'kaspiShop' ? (storeState === 'connected' ? t.connected : storeState === 'loading' ? '' : t.notConnected) : undefined
  const dot = dotState === 'product'
    ? <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: def.bg }} aria-hidden="true" />
    : dotState === 'loading'
      ? <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'var(--nav-border)' }} aria-hidden="true" />
      : <span className="shell-dot" data-state={dotState} title={dotTitle} role="img" aria-label={dotTitle} />

  const panel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-4 pb-3 flex-shrink-0 space-y-3">
        <div ref={switchRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            className="w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ border: '1px solid var(--nav-border)' }}
          >
            {dot}
            <span className="flex-1 min-w-0 truncate text-[15px] font-bold" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>{def.name}</span>
            <span style={{ color: 'var(--nav-text-muted)' }}><Chevron /></span>
          </button>
          {menuOpen && (
            <ul role="listbox" className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 nav-glass rounded-2xl py-1.5 shadow-2xl" style={{ background: 'var(--nav-bg)' }}>
              {switchable.map((p) => (
                <li key={p.key} role="option" aria-selected={p.key === product}>
                  <a
                    href={p.key === product ? undefined : productCabinetHref(p.key, hostname)}
                    onClick={(e) => { if (p.key === product) { e.preventDefault(); setMenuOpen(false) } }}
                    className="flex items-center gap-2.5 px-3 py-2 text-[14px] font-medium hover:bg-[var(--nav-surface-glass)]"
                    style={{ color: p.key === product ? 'var(--nav-accent)' : 'var(--nav-text-primary)' }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.bg }} aria-hidden="true" />
                    <span className="truncate flex-1">{p.name}</span>
                    {p.key === product && <span aria-hidden="true">✓</span>}
                  </a>
                </li>
              ))}
              <li role="presentation" className="mt-1 pt-1" style={{ borderTop: '1px solid var(--nav-border)' }}>
                <a href="https://invoices.kz/products" className="flex items-center px-3 py-2 text-[13px] font-semibold" style={{ color: 'var(--nav-accent)' }}>{t.all} →</a>
              </li>
            </ul>
          )}
        </div>
        {product === 'kaspiShop' && <KaspiShopStoreSwitcher inSidebar onState={setStoreState} />}
      </div>

      <nav aria-label={def.name} className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-2 pb-3">
        {links.map((l) => {
          const active = l.href === bestMatch
          return (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className="flex items-center min-h-[40px] px-3 rounded-xl text-[14px] font-medium mb-0.5 transition-colors"
              style={{
                background: active ? 'var(--nav-accent-soft, var(--nav-surface-glass))' : 'transparent',
                color: active ? 'var(--nav-accent)' : 'var(--nav-text-secondary)',
              }}
            >
              {l.label[lang]}
            </a>
          )
        })}
      </nav>

      <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--nav-border)' }}>
        <div className="flex items-center gap-1 rounded-2xl pl-3 pr-1.5 py-1.5" style={{ background: 'var(--nav-surface-glass)' }}>
          <button
            type="button"
            onClick={() => { setOpen(false); window.dispatchEvent(new Event('open-wallet-panel')) }}
            title={t.topup}
            className="flex-1 min-w-0 text-left"
          >
            <div className="text-[11px] font-semibold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>{t.balance}</div>
            <div className="text-[15px] font-bold tabular-nums truncate" style={{ color: 'var(--nav-text-primary)' }}>
              {balance === null ? '···' : `${balance.toLocaleString('ru-KZ')} ₸`}
            </div>
          </button>
          <button type="button" onClick={() => { setOpen(false); openUtility('notifications') }} title={t.notifications} aria-label={t.notifications} className="relative w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 hover:bg-[var(--nav-surface-glass)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M10 19a2 2 0 0 0 4 0" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {util.unread > 0 && (
              <span className="absolute top-0 right-0 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ background: 'var(--nav-critical)', color: 'var(--nav-accent-ink)' }}>
                {util.unread > 9 ? '9+' : util.unread}
              </span>
            )}
          </button>
          <button type="button" onClick={() => { setOpen(false); openUtility('help') }} title={t.help} aria-label={t.help} className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 hover:bg-[var(--nav-surface-glass)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="var(--nav-accent)" strokeWidth="1.6" />
              <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.4v.3" stroke="var(--nav-accent)" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="12" cy="17" r="0.9" fill="var(--nav-accent)" />
            </svg>
          </button>
          <button type="button" onClick={() => { setOpen(false); openUtility('account') }} title={t.account} aria-label={t.account} className="w-9 h-9 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            {util.initials}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <ShellContext.Provider value={true}>
      <div className="product-shell" style={{ '--shell-left': '272px' } as React.CSSProperties}>
        {/* Desktop: fixed sidebar card, same floating gap as DesktopShell's card.
            No overflow clipping here: the product menu and the store list open over it. */}
        <aside className="hidden lg:block fixed top-3 left-3 bottom-3 w-[248px] z-30 rounded-[28px] shadow-2xl ring-1 ring-black/5 nav-glass" aria-label={def.name}>
          {panel}
        </aside>

        {/* Mobile: sticky top bar + drawer. */}
        <div className="lg:hidden sticky top-0 z-40 h-14 flex items-center gap-2 px-2 nav-glass" style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t.menu}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-xl"
            style={{ color: 'var(--nav-text-primary)' }}
          >
            ☰
          </button>
          {dot}
          <span className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>{def.name}</span>
        </div>
        {open && (
          <div className="lg:hidden fixed inset-0 z-50">
            <button type="button" aria-label={t.close} className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute top-0 left-0 bottom-0 w-[280px] max-w-[85vw] nav-glass shadow-2xl" style={{ background: 'var(--nav-bg)' }}>
              {panel}
            </div>
          </div>
        )}

        <div className="product-shell-main">{children}</div>
      </div>
    </ShellContext.Provider>
  )
}
