# Unified Navigation & Design System (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three disconnected navigation experiences (`AppNav`, `KaspiShopSidebar`, no-nav-in-AI-agent) with one shared `SiteNav` component in the validated aurora-glass visual language, wired onto the 14 pages that currently use the old nav (or none).

**Architecture:** One new component, `src/components/SiteNav.tsx`, owns navigation only (logo, top-level links, per-section dropdowns, active-state, mobile bottom bar). `TopUtilityBar.tsx` keeps owning wallet/notifications/account (untouched logic, only restyled + repositioned to visually sit inside the new bar). New CSS custom properties (`--nav-*` prefix) added to `globals.css` carry the palette/glass/typography tokens; no Tailwind config file exists in this project (v4 CSS-first), so tokens + plain CSS classes are the right mechanism, matching the project's existing raw-hex convention.

**Tech Stack:** Next.js (App Router), React client components, Supabase JS client, Tailwind v4 (CSS-first, no JS config), plain CSS custom properties for the new tokens (framer-motion already a dependency, used for one indicator pattern).

## Global Constraints

- System font stack only: `ui-sans-serif, -apple-system, "Segoe UI Variable", "Segoe UI", Roboto, sans-serif` — no webfont, no `next/font`. Two custom webfonts were tried and explicitly rejected by the user during design; do not reintroduce one.
- Heading/number font weights: 600–700 only, never 800–900. Negative letter-spacing (-0.02em to -0.04em) on headings and large numbers.
- Categorical accent triad (validated against the dataviz-skill CVD checker, 6/6 in both light and dark): violet `#5B4CE0` (light) / `#7A6CF0` (dark) for Счета/primary, teal `#00A0B8` / `#0E99AA` for Kaspi Магазин, magenta `#B23A70` / `#CE4C86` for AI-агент — magenta is identity-only (icons/dots), never used in decorative gradients or backgrounds.
- Decorative gradient bars/text: two-stop only (`accent → teal`). No three-stop, no magenta in decoration.
- Status badges: flat solid fill + white text, not soft-tinted translucent backgrounds.
- Motion: keep functional motion only (hover lift+shadow, dropdown fade/scale-in, list-row hover highlight). Do not add decorative/gimmick motion (icon rotate-on-hover, bell-wiggle, coin-flip). All animation respects `prefers-reduced-motion`.
- Wallet/notification data logic is out of scope — `TopUtilityBar`'s fetch/topup/mark-read logic must not change, only its visual classes and desktop position.
- Kaspi Магазин and AI-агент nav items stay admin-only (`is_admin` gate), matching current `AppNav` behavior — do not open them to all users in this phase.
- Do not create a shared `useIsAdmin()` hook or otherwise refactor the admin-check pattern — copy the existing per-component `profiles.is_admin` fetch (matches current codebase convention: every consumer re-fetches independently, YAGNI applies to introducing new shared abstractions in this phase).

---

## Task 1: Design tokens in `globals.css`

**Files:**
- Modify: `src/app/globals.css` (add a new block; do not touch the existing `[data-theme]` system, lines 15-246 per current file — those stay as-is, unrelated to this work)

**Interfaces:**
- Produces: CSS custom properties `--nav-bg`, `--nav-surface-glass`, `--nav-accent`, `--nav-accent-ink`, `--nav-accent-soft`, `--nav-accent-track`, `--nav-teal`, `--nav-teal-soft`, `--nav-magenta`, `--nav-magenta-soft`, `--nav-success`, `--nav-success-soft`, `--nav-text-primary`, `--nav-text-secondary`, `--nav-text-muted`, `--nav-border`, `--nav-border-soft`, `--nav-card-glow` (a `box-shadow` value). Produces CSS classes `.nav-glass` (glass card base), `.nav-aurora` + `.nav-blob--a/b/c` (background blobs), `@keyframes nav-drift1/2/3`. These are consumed by Task 2 (`SiteNav.tsx`) and Task 5 (`TopUtilityBar.tsx` restyle).

- [ ] **Step 1: Append the token block to `globals.css`**

Add this at the end of the file (after the existing hover-interaction block, so it doesn't interleave with the `[data-theme]` override rules):

```css
/* ---- SiteNav design tokens (2026-08-18 unified-nav phase) ----
   Deliberately prefixed --nav-* to avoid collision with the existing
   [data-theme] dark-mode variables above (--bg/--accent/etc are already
   claimed by that system). Light values apply by default; dark values
   apply under prefers-color-scheme, matching this project's existing
   OS-level dark media query rather than the [data-theme] toggle system,
   since SiteNav is new UI with no legacy light/dark expectation to match. */
:root {
  --nav-bg: #FFFFFF;
  --nav-surface-glass: rgba(20, 22, 42, 0.035);
  --nav-accent: #5B4CE0;
  --nav-accent-ink: #FFFFFF;
  --nav-accent-soft: rgba(91, 76, 224, 0.12);
  --nav-accent-track: rgba(91, 76, 224, 0.18);
  --nav-teal: #00A0B8;
  --nav-teal-soft: rgba(0, 160, 184, 0.14);
  --nav-magenta: #B23A70;
  --nav-magenta-soft: rgba(178, 58, 112, 0.14);
  --nav-success: #12946B;
  --nav-success-soft: rgba(18, 148, 107, 0.12);
  --nav-text-primary: #14162A;
  --nav-text-secondary: #565C7E;
  --nav-text-muted: #8A8FB0;
  --nav-border: rgba(20, 22, 42, 0.09);
  --nav-border-soft: rgba(20, 22, 42, 0.07);
  --nav-card-glow: 0 20px 50px -22px rgba(30, 25, 90, 0.28);
}

@media (prefers-color-scheme: dark) {
  :root {
    --nav-bg: #0A0B17;
    --nav-surface-glass: rgba(255, 255, 255, 0.05);
    --nav-accent: #7A6CF0;
    --nav-accent-ink: #14162A;
    --nav-accent-soft: rgba(122, 108, 240, 0.22);
    --nav-accent-track: rgba(122, 108, 240, 0.26);
    --nav-teal: #0E99AA;
    --nav-teal-soft: rgba(14, 153, 170, 0.24);
    --nav-magenta: #CE4C86;
    --nav-magenta-soft: rgba(206, 76, 134, 0.24);
    --nav-success: #3ED598;
    --nav-success-soft: rgba(62, 213, 152, 0.18);
    --nav-text-primary: #F2F3FA;
    --nav-text-secondary: #A6ACC9;
    --nav-text-muted: #6B7094;
    --nav-border: rgba(255, 255, 255, 0.10);
    --nav-border-soft: rgba(255, 255, 255, 0.07);
    --nav-card-glow: 0 26px 60px -20px rgba(0, 0, 0, 0.55);
  }
}

.nav-glass {
  background: var(--nav-surface-glass);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  border: 1px solid var(--nav-border-soft);
}

.nav-aurora {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.nav-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.16;
  will-change: transform;
}
@media (prefers-color-scheme: dark) {
  .nav-blob { opacity: 0.24; }
}
.nav-blob--a { width: 540px; height: 540px; left: -140px; top: -160px; background: var(--nav-accent); animation: nav-drift1 26s ease-in-out infinite alternate; }
.nav-blob--b { width: 470px; height: 470px; right: -140px; top: 5%; background: var(--nav-teal); animation: nav-drift2 32s ease-in-out infinite alternate; }
.nav-blob--c { width: 320px; height: 320px; left: 25%; bottom: -170px; background: var(--nav-magenta); opacity: 0.10; animation: nav-drift3 29s ease-in-out infinite alternate; }
@media (prefers-color-scheme: dark) {
  .nav-blob--c { opacity: 0.14; }
}
@keyframes nav-drift1 { from { transform: translate(0,0) scale(1); } to { transform: translate(50px, 40px) scale(1.08); } }
@keyframes nav-drift2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-40px, 50px) scale(1.05); } }
@keyframes nav-drift3 { from { transform: translate(0,0) scale(1); } to { transform: translate(35px, -40px) scale(1.1); } }
@media (prefers-reduced-motion: reduce) {
  .nav-blob { animation: none !important; }
}
```

- [ ] **Step 2: Mount the aurora background globally**

The blob classes from Step 1 need a real DOM element to apply to somewhere that reaches every page — the same way `TopUtilityBar` is mounted once in the root layout rather than per-page (see `src/app/layout.tsx`, sibling to `{children}`). Create `src/components/NavAurora.tsx`:

```tsx
export default function NavAurora() {
  return (
    <div className="nav-aurora" aria-hidden="true">
      <div className="nav-blob nav-blob--a" />
      <div className="nav-blob nav-blob--b" />
      <div className="nav-blob nav-blob--c" />
    </div>
  )
}
```

Then in `src/app/layout.tsx`, add the import alongside the existing `TopUtilityBar` import (was line 6: `import TopUtilityBar from '@/components/TopUtilityBar'`) — add directly below it:
```tsx
import NavAurora from '@/components/NavAurora'
```
And mount it as a sibling to `{children}` (was line 69: `<TopUtilityBar />`, inside `<ThemeProvider>`) — add it immediately before `{children}` so it paints behind everything (it's `position: fixed; z-index: -1` per Task 1's CSS, so DOM order doesn't strictly matter for stacking, but placing it first keeps the file readable as "background, then content, then floating chrome"):
```tsx
          <ThemeProvider>
            <NavAurora />
            {children}
            <TopUtilityBar />
          </ThemeProvider>
```
This makes the aurora background apply site-wide automatically (all 14 rewired pages and every other page alike) without touching any individual page file — consistent with the constraint that this phase doesn't roll the full visual system onto the other ~33 pages, since a background tint alone is unobtrusive enough to apply everywhere (unlike the nav chrome itself, which only appears where `SiteNav` is explicitly wired in).

- [ ] **Step 3: Verify the app still builds**

Run: `npm run build` (or `npm run dev` and load any page) from `c:\Users\Abilbayev.Alikhan\invoices-kz`.
Expected: no CSS errors; every page now shows the subtle blurred aurora background (very faint in light mode — opacity 0.16/0.10 per Task 1 — this is intentional, not a bug if it's barely visible on first glance).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/NavAurora.tsx src/app/layout.tsx
git commit -m "feat(design): add SiteNav design tokens (--nav-* palette, glass, aurora blobs), mount aurora background globally"
```

---

## Task 2: `SiteNav` component — desktop bar, dropdowns, mobile bottom bar

**Files:**
- Create: `src/components/SiteNav.tsx`

**Interfaces:**
- Consumes: `--nav-*` CSS custom properties and `.nav-glass`/`.nav-aurora`/`.nav-blob*` classes from Task 1. Consumes `supabase` from `@/lib/supabase`, `useLanguage` from `./LanguageProvider` (both existing, same imports `AppNav.tsx` already uses).
- Produces: `export default function SiteNav({ desktopOnly = false }: { desktopOnly?: boolean })` — **same prop signature as the `AppNav` it replaces**, so every call site from Task 4/6/7 is a drop-in rename (`<AppNav ... />` → `<SiteNav ... />`, `<AppNav desktopOnly />` → `<SiteNav desktopOnly />`). The aurora background is mounted separately/globally (Task 1, Step 2, via `NavAurora` in the root layout) — `SiteNav` itself only renders nav chrome, not the background.

- [ ] **Step 1: Write the component**

Create `src/components/SiteNav.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify it compiles standalone**

Run: `npx tsc --noEmit` from `c:\Users\Abilbayev.Alikhan\invoices-kz`.
Expected: no new type errors attributable to `SiteNav.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/SiteNav.tsx
git commit -m "feat(nav): add SiteNav component (desktop dropdowns + mobile bottom bar)"
```

---

## Task 3: Move Kaspi Магазин order-status filter out of the (deleted) sidebar and into the orders page itself

**Context:** `KaspiShopSidebar`'s `Заказы` item currently nests a **desktop-only** (`hidden lg:flex`) live order-status submenu (`ORDER_STATUS_TABS`, with per-status counts) fed by `orderStatus`/`orderCounts` props that only the orders page itself computes. That is page-specific filter state, not global navigation — it does not belong inside the new shared `SiteNav` dropdown (which has no way to receive live per-page counts). Moving it onto the page itself as a filter-chip row is also a **fix**, not just a relocation: today mobile users have no way to filter orders by status at all (the submenu is desktop-only); as page-local filter chips it can work on both.

**Files:**
- Modify: `src/app/kaspi-shop/orders/page.tsx` (add a filter-chip row using the page's own existing `status`/`counts` values — read the file first to find their exact current variable names before wiring this, they're referenced as `status`/`counts` in the Sidebar call per Section 5 research but confirm the real local names before editing)
- No changes to `src/lib/kaspiShop/orderStatuses.ts` — reuse its existing `ORDER_STATUS_TABS` export as-is.

**Interfaces:**
- Consumes: `ORDER_STATUS_TABS` from `@/lib/kaspiShop/orderStatuses` (existing export, `{ value: string; label: string }[]`).

- [ ] **Step 1: Read the current orders page around its data-fetching and the removed Sidebar call**

Run: read `src/app/kaspi-shop/orders/page.tsx` in full before editing — this plan's earlier research only captured the Sidebar call site (line 146: `<KaspiShopSidebar active="orders" orderStatus={status} orderCounts={counts} />`), not the full component. Confirm the exact local variable names/types for `status` and `counts`, and how status filtering currently drives the page's data query, before writing the chip row so it wires to the real state setter (likely a URL search-param based filter given the Sidebar links were `?status=${tab.value}` — check whether the page reads `useSearchParams()` or a different mechanism).

- [ ] **Step 2: Add a filter-chip row**

Insert immediately below the page's main heading (exact insertion point depends on the file's real structure, confirmed in Step 1), a horizontally-scrollable chip row:

```tsx
<div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 lg:mx-0 lg:px-0">
  {ORDER_STATUS_TABS.map(tab => {
    const isActive = status === tab.value
    const count = counts?.[tab.value]
    return (
      <button
        key={tab.value}
        onClick={() => router.push(`/kaspi-shop/orders?status=${tab.value}`)}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
        style={{
          background: isActive ? 'var(--nav-accent)' : 'var(--nav-surface-glass)',
          color: isActive ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
        }}
      >
        {tab.label}
        {!!count && <span className="tabular-nums" style={{ opacity: isActive ? 0.8 : 0.6 }}>{count}</span>}
      </button>
    )
  })}
</div>
```

Adjust `status`/`counts`/`router` identifiers to match whatever Step 1 found in the real file (this plan cannot guess the exact current variable names without reading the file — **do not skip Step 1**).

- [ ] **Step 3: Manual check**

Run the dev server, open `/kaspi-shop/orders` on both a desktop-width and a mobile-width viewport (or resize devtools). Confirm the chip row scrolls horizontally on narrow widths and that clicking a chip filters the list the same way the old sidebar submenu did.

- [ ] **Step 4: Commit**

```bash
git add src/app/kaspi-shop/orders/page.tsx
git commit -m "feat(kaspi-shop): move order-status filter from sidebar submenu to on-page chips (now works on mobile too)"
```

---

## Task 4: Wire `SiteNav` onto the 5 former-`AppNav` pages

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/history/page.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/invoice/[id]/page.tsx`
- Modify: `src/app/invoice/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `SiteNav` from Task 2 (`src/components/SiteNav.tsx`), same props as old `AppNav`.

- [ ] **Step 1: `src/app/dashboard/page.tsx`**

Change the import (was line 7): `import AppNav from '@/components/AppNav'` → `import SiteNav from '@/components/SiteNav'`
Change the render (was line 847): `<AppNav />` → `<SiteNav />`

- [ ] **Step 2: `src/app/history/page.tsx`**

Change the import (was line 6): `import AppNav from '@/components/AppNav'` → `import SiteNav from '@/components/SiteNav'`
Change the render (was line 317): `<AppNav />` → `<SiteNav />`

- [ ] **Step 3: `src/app/profile/page.tsx`**

Change the import (was line 6): `import AppNav from '@/components/AppNav'` → `import SiteNav from '@/components/SiteNav'`
Change **both** render sites: (was line 98) `<AppNav />` → `<SiteNav />`, and (was line 407) `<AppNav />` → `<SiteNav />`.

- [ ] **Step 4: `src/app/invoice/[id]/page.tsx`**

Change the import (was line 15): `import AppNav from '@/components/AppNav'` → `import SiteNav from '@/components/SiteNav'`
Change **both** render sites (both used `desktopOnly`): (was line 334) `<AppNav desktopOnly />` → `<SiteNav desktopOnly />`, and (was line 939) `<AppNav desktopOnly />` → `<SiteNav desktopOnly />`.

- [ ] **Step 5: `src/app/invoice/[id]/edit/page.tsx`**

Change the import (was line 8): `import AppNav from '@/components/AppNav'` → `import SiteNav from '@/components/SiteNav'`
Change **both** render sites: (was line 150) `<AppNav desktopOnly />` → `<SiteNav desktopOnly />`, and (was line 336) `<AppNav desktopOnly />` → `<SiteNav desktopOnly />`.

- [ ] **Step 6: Manual check**

Run the dev server. Visit `/dashboard`, `/history`, `/profile`, and any real invoice's view/edit page. Confirm: the new top bar renders on desktop widths, the mobile bottom bar renders below `lg`, dropdowns for Счета/Kaspi Магазин/AI-агент open and close, the unpaid-invoice count badge shows correctly on `/history`'s mobile icon (compare against the count you'd see in the old `AppNav`), and page content isn't hidden behind the new bars (check top padding on desktop now that there's a sticky top bar in addition to whatever `DesktopShell` already reserves — **this is the single most likely regression**: `DesktopShell`'s fixed card shell was built assuming no sticky top bar existed; if content now renders under the new nav, add top padding/margin to the affected page's content wrapper, do not modify `DesktopShell` itself for this phase).

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/history/page.tsx src/app/profile/page.tsx "src/app/invoice/[id]/page.tsx" "src/app/invoice/[id]/edit/page.tsx"
git commit -m "feat(nav): wire SiteNav onto dashboard/history/profile/invoice pages, replacing AppNav"
```

---

## Task 5: Restyle and reposition `TopUtilityBar` to sit inside the new top bar (desktop) — no logic changes

**Files:**
- Modify: `src/components/TopUtilityBar.tsx`

**Interfaces:**
- Consumes: `--nav-*` tokens from Task 1.
- Produces: no interface change — same component, same mount point in `layout.tsx`, same exported default, same internal state/handlers untouched.

- [ ] **Step 1: Read the file's current root positioning classes**

The component's outer wrapper currently uses `fixed bottom-20 lg:bottom-3 right-3 z-50` (per prior research/memory of this component). Read the file to confirm the exact current class string before editing (it may have evolved since that note was written).

- [ ] **Step 2: Change desktop position from bottom-right to top-right**

Replace the desktop portion of the positioning classes so the component sits at `lg:top-3` instead of `lg:bottom-3` (keep the mobile `bottom-20` unchanged — mobile has no top bar, `SiteNav`'s mobile bottom bar occupies the bottom, so `TopUtilityBar` staying bottom-anchored-with-clearance on mobile is correct and must not change). The result should read `fixed bottom-20 lg:bottom-auto lg:top-3 right-3 z-50` (add `lg:bottom-auto` so the mobile `bottom-20` doesn't leak into the desktop breakpoint alongside the new `lg:top-3`).

- [ ] **Step 3: Restyle the trigger buttons and panels with the new tokens**

Update the component's trigger-button and panel background/border/shadow classes to use `.nav-glass` (from Task 1) instead of whatever opaque `bg-white`/`shadow-xl` classes it currently uses, and swap any hardcoded `#1C2056` accent references in this file specifically for `var(--nav-accent)` so the wallet pill visually matches the new nav's accent color. **Do not change**: any `fetch(...)`, `useState`, `useEffect`, the `WALLETS` array, `signOut`, `loadNotifications`, `markAllRead`, or any handler logic — this step is class-attribute-only.

- [ ] **Step 4: Manual check**

Run the dev server on a page using the new `SiteNav` (e.g. `/dashboard`). Confirm on desktop width the wallet balance pill now sits top-right, roughly level with `SiteNav`'s bar, with the new glass styling. Confirm on mobile width it's unchanged (bottom-right, clear of the new bottom bar). Click through: wallet panel opens and shows a real balance, notifications panel opens and shows real (or empty) notifications, account panel's "Выйти" still signs out correctly. **This step is a regression check — the goal is zero functional change**, only visual/positional.

- [ ] **Step 5: Commit**

```bash
git add src/components/TopUtilityBar.tsx
git commit -m "style(nav): restyle TopUtilityBar to new design tokens, reposition to top-right on desktop"
```

---

## Task 6: Wire `SiteNav` onto the 7 former-`KaspiShopSidebar` pages

**Files:**
- Modify: `src/app/kaspi-shop/page.tsx`
- Modify: `src/app/kaspi-shop/orders/page.tsx`
- Modify: `src/app/kaspi-shop/orders/[code]/page.tsx`
- Modify: `src/app/kaspi-shop/finance/page.tsx`
- Modify: `src/app/kaspi-shop/niches/page.tsx`
- Modify: `src/app/kaspi-shop/pending-products/page.tsx`
- Modify: `src/app/kaspi-shop/profit/page.tsx`

**Interfaces:**
- Consumes: `SiteNav` from Task 2. `SiteNav` takes no `active`/section props (unlike the old `KaspiShopSidebar`) — the new component derives its own active-dropdown highlighting from `usePathname()` internally, so callers just render `<SiteNav />` with no props, same as the dashboard/history/profile call sites.

All 7 files share the identical pattern (per Section 5 research): `import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'` and a `<main className="min-h-screen bg-[#F6F6FB] lg:flex">` wrapper with `<KaspiShopSidebar active="..." .../>` as the first child, page content as a sibling.

- [ ] **Step 1: `src/app/kaspi-shop/page.tsx`**

Remove the import: `import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'`
Add: `import SiteNav from '@/components/SiteNav'`
Replace the render `<KaspiShopSidebar active="demping" />` with `<SiteNav />` — but note `SiteNav` renders as a top bar + separate mobile bottom bar, **not** as a flex sibling inside `<main className="... lg:flex">` the way the old sidebar did. Change the wrapping `<main>` from `className="min-h-screen bg-[#F6F6FB] lg:flex"` to `className="min-h-screen bg-[#F6F6FB]"` (drop `lg:flex` — there's no longer a sidebar to lay out side-by-side with), and move the `<SiteNav />` call to be the **first** element inside `<main>`, before the content that used to be the flex sibling (which now just flows normally below it, full width).

- [ ] **Step 2: `src/app/kaspi-shop/orders/page.tsx`**

Same transformation: remove the `KaspiShopSidebar` import, add `SiteNav`, replace `<KaspiShopSidebar active="orders" orderStatus={status} orderCounts={counts} />` with `<SiteNav />` (the `orderStatus`/`orderCounts` props are no longer needed here — they now feed the filter-chip row added in Task 3 directly, not a nav component), drop `lg:flex` from the `<main>` wrapper.

- [ ] **Step 3: `src/app/kaspi-shop/orders/[code]/page.tsx`**

Same transformation: replace `<KaspiShopSidebar active="orders" />` with `<SiteNav />`, drop `lg:flex` from `<main>`.

- [ ] **Step 4: `src/app/kaspi-shop/finance/page.tsx`**

Same transformation: replace `<KaspiShopSidebar active="finance" />` with `<SiteNav />`, drop `lg:flex` from `<main>`.

- [ ] **Step 5: `src/app/kaspi-shop/niches/page.tsx`**

Same transformation: replace `<KaspiShopSidebar active="niches" />` with `<SiteNav />`, drop `lg:flex` from `<main>`.

- [ ] **Step 6: `src/app/kaspi-shop/pending-products/page.tsx`**

Same transformation: replace `<KaspiShopSidebar active="pending-products" />` with `<SiteNav />`, drop `lg:flex` from `<main>`.

- [ ] **Step 7: `src/app/kaspi-shop/profit/page.tsx`**

Same transformation: replace `<KaspiShopSidebar active="profit" />` with `<SiteNav />`, drop `lg:flex` from `<main>`.

- [ ] **Step 8: Manual check**

Run the dev server (admin account, since these pages/nav items are admin-gated). Visit all 7 Kaspi Shop pages. Confirm `SiteNav`'s "Kaspi Магазин" dropdown correctly highlights as the active top-level section on every one of them (via the `isActiveSection` prefix-match against `/kaspi-shop`), and that page content that used to sit beside the sidebar now reads correctly full-width with no leftover empty gutter space (an artifact of the removed `lg:flex` + sidebar's `lg:w-[220px]`).

- [ ] **Step 9: Commit**

```bash
git add src/app/kaspi-shop/page.tsx "src/app/kaspi-shop/orders/page.tsx" "src/app/kaspi-shop/orders/[code]/page.tsx" src/app/kaspi-shop/finance/page.tsx src/app/kaspi-shop/niches/page.tsx src/app/kaspi-shop/pending-products/page.tsx src/app/kaspi-shop/profit/page.tsx
git commit -m "feat(nav): wire SiteNav onto all 7 Kaspi Shop pages, replacing KaspiShopSidebar"
```

---

## Task 7: Wire `SiteNav` onto the 2 AI-agent pages (first real nav they've had)

**Files:**
- Modify: `src/app/ai-agent/review/page.tsx`
- Modify: `src/app/ai-agent/settings/page.tsx`

**Interfaces:**
- Consumes: `SiteNav` from Task 2.

- [ ] **Step 1: `src/app/ai-agent/review/page.tsx`**

Add the import: `import SiteNav from '@/components/SiteNav'`
Change the top-level return (was):
```tsx
  return (
    <main className="min-h-screen bg-gray-50">
    <div className="max-w-xl mx-auto p-6 pb-24">
```
to:
```tsx
  return (
    <main className="min-h-screen bg-gray-50">
    <SiteNav />
    <div className="max-w-xl mx-auto p-6 pb-24">
```
Also add `<SiteNav />` to the loading early-return (was `if (loading) return <div className="min-h-screen bg-gray-50 p-8 text-center text-gray-400">Загрузка…</div>`) — wrap it so the nav is visible even during the loading state, matching how every other page in this rollout keeps its nav mounted through loading:
```tsx
if (loading) return (
  <main className="min-h-screen bg-gray-50">
    <SiteNav />
    <div className="p-8 text-center text-gray-400">Загрузка…</div>
  </main>
)
```

- [ ] **Step 2: `src/app/ai-agent/settings/page.tsx`**

Same transformation. Add the import: `import SiteNav from '@/components/SiteNav'`
Change the top-level return (was):
```tsx
  return (
    <main className="min-h-screen bg-gray-50">
    <div className="max-w-xl mx-auto p-6 pb-24">
```
to:
```tsx
  return (
    <main className="min-h-screen bg-gray-50">
    <SiteNav />
    <div className="max-w-xl mx-auto p-6 pb-24">
```
And the same loading-state wrap as Step 1.

- [ ] **Step 3: Manual check**

Run the dev server (admin account). Visit `/ai-agent/review` and `/ai-agent/settings`. Confirm these pages now have both the desktop top bar and mobile bottom bar for the first time, the "AI-агент" dropdown highlights as active, and the existing in-page back-links (`← Настройки агента` / `‹ Назад`) still work unchanged (they're redundant with the new nav now but removing them is out of scope for this phase — leave them, don't clean them up here).

- [ ] **Step 4: Commit**

```bash
git add src/app/ai-agent/review/page.tsx src/app/ai-agent/settings/page.tsx
git commit -m "feat(nav): add SiteNav to AI-agent pages (previously had no navigation at all)"
```

---

## Task 8: Delete `AppNav` and `KaspiShopSidebar`, verify no stragglers

**Files:**
- Delete: `src/components/AppNav.tsx`
- Delete: `src/components/kaspiShop/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing new. This task only removes code once Tasks 4, 6, and 7 have eliminated every consumer.

- [ ] **Step 1: Grep-verify zero remaining imports**

Run: `grep -rn "components/AppNav'" src/` and `grep -rn "components/kaspiShop/Sidebar'" src/` from `c:\Users\Abilbayev.Alikhan\invoices-kz`.
Expected: no matches. If any file still matches, stop and fix that file first (it was missed in Tasks 4/6/7) — do not delete the components while a live import remains, that's a broken build.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/AppNav.tsx src/components/kaspiShop/Sidebar.tsx
```

- [ ] **Step 3: Full build check**

Run: `npm run build` from `c:\Users\Abilbayev.Alikhan\invoices-kz`.
Expected: clean build, no missing-module errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(nav): delete AppNav and KaspiShopSidebar, fully replaced by SiteNav"
```

---

## Task 9: Full manual regression pass

**Files:** none (verification only)

- [ ] **Step 1: Desktop pass**

At a `≥1024px` viewport, visit all 14 rewired pages plus at least 2 untouched pages (e.g. `/upgrade`, `/admin`) to confirm those are unaffected. On the rewired pages: confirm the sticky top bar stays fixed on scroll, every dropdown opens/closes on click and on outside-click and on Escape, keyboard `Tab` reaches each nav button and dropdown link with a visible focus ring, the active section is correctly highlighted on every one of the 14 pages, and `TopUtilityBar`'s wallet/notifications/account panels all still function (open a panel, top up a wallet with a test amount if safe to do so in the current environment, check a notification, sign out and back in).

- [ ] **Step 2: Mobile pass**

At a `<1024px` viewport (or real device), confirm the bottom icon bar renders on all 14 pages, navigates correctly, shows the unpaid-invoice badge, and that `TopUtilityBar`'s pill sits above it without visual overlap (the `bottom-20` clearance from Task 5).

- [ ] **Step 3: Reduced motion**

Enable "reduce motion" at the OS level (or `prefers-reduced-motion: reduce` via devtools emulation). Confirm the globally-mounted aurora blobs (Task 1, Step 2) stop drifting, and that dropdown open/close is instant rather than animated.

- [ ] **Step 4: Report findings**

Summarize any regressions found to the user before considering this plan complete — do not silently fix unexpected issues outside this plan's stated scope without flagging them first (e.g., if `DesktopShell` content collides with the new sticky bar on a page not explicitly called out in Task 4's Step 6 note, surface that rather than improvising a fix).
