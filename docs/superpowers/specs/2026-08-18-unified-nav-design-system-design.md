# Unified Navigation & Design System (Phase 1) — Design Spec

**Status:** Approved by user 2026-08-18, ready for implementation planning.

## Context

Over an extended design session, the user iterated a new visual direction for invoices.kz through a series of HTML mockups (published as Claude Artifacts), converging on a final design (final artifact: `https://claude.ai/code/artifact/91ce7dc9-baac-46d0-a438-37b93def4f6b`, local source retained at the session's scratchpad path for reference during implementation). This spec captures that validated design and scopes the first implementation phase: **navigation unification + design system rollout**, explicitly excluding the wallet-data-merge and the AI FAQ chat widget (separate, later phases — see "Out of scope").

### Current architecture (confirmed live via code read, 2026-08-18)

- **`src/components/AppNav.tsx`** — combined mobile bottom bar + desktop floating sidebar, gated by `lg:` breakpoint inside one component. Items: Создать (`/dashboard`), История (`/history`), Профиль (`/profile`), plus admin-gated Kaspi Магазин (`/kaspi-shop`) and AI-агент (`/ai-agent/settings`). No submenu/dropdown pattern. Used by 5 pages: `dashboard`, `history`, `profile`, `invoice/[id]`, `invoice/[id]/edit`.
- **`src/components/kaspiShop/Sidebar.tsx`** — separate desktop-only sidebar (`KaspiShopSidebar`), same rounded-card visual language as AppNav by design. Items: Демпинг, Заказы (has a submenu — order-status tabs), Финансы, Нераспознанные товары, Ниши, Прибыль. Used by 7 pages under `src/app/kaspi-shop/*`.
- **AI-agent pages** (`src/app/ai-agent/review/page.tsx`, `src/app/ai-agent/settings/page.tsx`) — no nav component at all today.
- **`src/components/TopUtilityBar.tsx`** — globally mounted in `src/app/layout.tsx`, already wallet-agnostic via a `WALLETS` config array (three entries: `invoices`/kaspiPay commission, `kaspiShop`, `aiAgent`, the latter two admin-gated). Renders a floating bottom-right pill + slide-out panel with wallet switcher, balance, ledger, top-up. This is the **only** existing global nav-adjacent element that already reaches every page including AI-agent's.

### Why now

This is "point 1" of a three-part platform-unification recommendation the user approved earlier: unify navigation first (cheapest, highest-leverage step), defer wallet-data-merge and Pro-gating decisions to their own later phases. The user has now validated a concrete visual language for it and wants implementation to start immediately, using subagents for speed.

## Goal

Replace the three disconnected navigation experiences (AppNav, KaspiShopSidebar, no-nav-in-AI-agent) with **one shared navigation component**, styled in the validated visual language, used identically across all three product areas — while leaving the underlying wallet **data model** (still three separate tables) untouched.

## Design

### 1. Design tokens (new: `src/styles/design-tokens.css` or additions to `src/app/globals.css` — implementer's call on file split, follow existing project convention)

CSS custom properties, light + dark aware (`prefers-color-scheme` + explicit `[data-theme]` override, matching the project's existing dark-mode pattern if any exists — check `globals.css` first; if the app is light-only today, ship light tokens only and structure the custom properties so dark can be added later without a rewrite).

Validated palette (from the final mockup, categorical triad passed the dataviz-skill CVD validator at 6/6 checks in both light and dark):

| Token | Light | Dark |
|---|---|---|
| `--nav-bg` | `#FFFFFF` @ ~4% surface-glass tint | `#0A0B17` @ ~5% white tint |
| `--nav-accent` (Счета / primary) | `#5B4CE0` | `#7A6CF0` |
| `--nav-teal` (Kaspi Магазин) | `#00A0B8` | `#0E99AA` |
| `--nav-magenta` (AI-агент) | `#B23A70` | `#CE4C86` |
| `--nav-success` | `#12946B` | `#3ED598` |
| `--nav-text-primary` | `#14162A` | `#F2F3FA` |
| `--nav-text-secondary` | `#565C7E` | `#A6ACC9` |
| `--nav-text-muted` | `#8A8FB0` | `#6B7094` |
| `--nav-border` | `rgba(20,22,42,.09)` | `rgba(255,255,255,.10)` |
| `--nav-border-soft` | `rgba(20,22,42,.07)` | `rgba(255,255,255,.07)` |

Aurora background: 3 blurred radial blobs (accent/teal/magenta), fixed position, `filter: blur(90px)`, slow alternating drift animation (`26s`/`32s`/`29s`), `prefers-reduced-motion` disables the drift entirely. Magenta blob kept deliberately smaller/dimmer than the other two (explicit user feedback: "less pink").

Glass card treatment: `background: var(--surface-glass)` (a 3.5–5% tint, not opaque), `backdrop-filter: blur(24px) saturate(140%)`, `border: 1px solid var(--nav-border-soft)`, radius 18–24px depending on card size, a 2–3px two-stop gradient accent bar (`accent → teal`, **not** three-stop — magenta dropped from decorative gradients, reserved only for its category-identity role on AI-агент elements) along the top edge of major cards.

Typography: system font stack only (`ui-sans-serif, -apple-system, "Segoe UI Variable", "Segoe UI", Roboto, sans-serif`) — **two custom webfonts were tried and explicitly rejected by the user** (Calistoga/Inter pairing, then Golos Text) as "too heavy/not beautiful." Headings and large numbers use **medium-bold weight (600–700), never 800–900**, with tight negative letter-spacing (‑0.02em to ‑0.04em on large numbers) — this specific correction came from the user pointing at a real reference (bi.group) and is a hard constraint, not a preference.

Motion: keep *functional* motion (hover lift + shadow on cards, sticky-nav dropdown fade/scale-in, chart line/area draw-in, count-up numbers on key stats, list-row hover highlight+shift). **Drop decorative/gimmick motion** (bell-wiggle, icon rotateY "coin flip", icon rotate-on-hover, button-icon rotate-90-on-hover) — explicit user correction, these read as "AI-generated flourish."

Status badges/pills: flat solid fill + white text (e.g., a paid-invoice badge is a solid `--nav-success` chip with white text), not soft-tinted translucent backgrounds — matches the bi.group reference the user pointed to.

### 2. `SiteNav` component (new: `src/components/SiteNav.tsx`, replaces `AppNav` + `KaspiShopSidebar`)

**Desktop (`≥lg`):** sticky top bar, `backdrop-filter` glass, full width. Left: logo mark + wordmark. Center-left: flat nav buttons — **Главная**, **Счета ▾**, **Kaspi Магазин ▾**, **AI-агент ▾** — each dropdown-capable button opens an absolutely-positioned glass dropdown panel (fade+scale-in, closes on outside click or Escape) listing that section's sub-pages:
- Счета ▾ → Создать счёт (`/dashboard`), История (`/history`), Шаблоны (`/profile/templates`)
- Kaspi Магазин ▾ → carries over KaspiShopSidebar's existing items (Демпинг, Заказы submenu, Финансы, Нераспознанные товары, Ниши, Прибыль) — same destinations, new visual shell
- AI-агент ▾ → Диалоги (`/ai-agent/review`), Настройки (`/ai-agent/settings`) — the only two pages that exist today; leave room in the component for more items later, don't hardcode assuming exactly two

Right side: existing `TopUtilityBar` wallet pill (kept as-is functionally — **the three-wallet switcher stays three wallets**, this phase does not merge data, see Out of scope), notification bell (existing or new — check if a notifications feature already exists before assuming; if not, this is a **stub only**: render the bell + unread-dot UI, no backend wiring, per YAGNI — don't build a notifications system nobody asked for in this phase), profile avatar button opening a dropdown (Профиль, Компания и реквизиты → `/profile`, Тариф и оплата → `/upgrade`, divider, Выйти → existing sign-out action).

**Mobile (`<lg`):** do **not** invent a new mobile pattern. Reuse AppNav's existing, already-shipped, never-complained-about bottom icon bar (fixed, icon+label buttons) — restyle it with the new tokens (colors, glass tint) but keep its existing interaction model unchanged: same fixed-bottom position, same icon-row layout. Add Kaspi Магазин and AI-агент as additional icons in this bar (currently admin-gated in AppNav — carry that gating forward unless told otherwise, see Open Questions). The wallet balance panel already opens as a centered modal-style overlay in `TopUtilityBar` — confirm it works at mobile widths (it should, it's not nav-anchored) rather than rebuilding it.

**Active-state:** underline/weight change on the current top-level section, matching the currently-open route — reuse `usePathname()` the way AppNav already does it (`AppNav.tsx` has an active-indicator pattern; follow that convention, don't reinvent).

### 3. Rollout scope for this phase

Wire `SiteNav` onto exactly the pages that currently render `AppNav` or `KaspiShopSidebar`, plus the two AI-agent pages that render neither today: **14 pages total** (5 + 7 + 2). Do **not** touch the other ~33 pages (auth screens, marketing pages, `/upgrade`, `/admin`, order-detail sub-pages, etc.) in this phase — they keep their current chrome. A follow-up phase (already logged as its own backlog item) extends the design tokens to the rest of the app.

Delete `AppNav.tsx` and `kaspiShop/Sidebar.tsx` once `SiteNav` fully replaces their usages (don't leave dead components around).

## Out of scope (explicitly deferred, do not build in this phase)

1. **Wallet data merge** (Kaspi Магазин credits + AI-агент credits → one balance table/ledger). The mockup's balance modal showed a *merged* 620-credit balance with a segmented usage bar — that UI assumed data that doesn't exist yet. In this phase, `TopUtilityBar` keeps showing **three separate wallets** exactly as it does today; only its visual skin (glass, tokens, typography) is updated. The merge is its own future phase requiring the user's explicit go-ahead (real money/credits, live user balances, needs a migration plan) — not authorized here.
2. **AI FAQ chat widget** at the bottom of the site — separate small feature, needs FAQ content the user hasn't written yet. Not part of this phase.
3. **Visual rollout to the remaining ~33 pages** beyond the 14 listed above.
4. Any change to notification *backend* logic — the bell in `SiteNav` is a visual stub in this phase unless a notifications system is discovered to already exist (verify during implementation; if it exists, wire it — if not, stub only).

## Open Questions (resolve before/during planning, not blocking spec approval)

- Are Kaspi Магазин / AI-агент nav items still meant to be admin-only (as AppNav currently gates them), or should this phase finally open them to all users? Memory notes both features were built with an explicit intent to "open to all users later" — but no explicit instruction to do so now. **Default: carry forward the existing admin-only gating unchanged; flag this as a one-line follow-up decision for the user, don't silently change access control in a navigation-refactor phase.**
- Does a real notifications backend exist anywhere in the codebase? Implementer should grep before assuming; spec above assumes "stub only" pending that check.

## Testing

- Visual: verify both the 14 rewired pages and confirm no other page's import of the now-deleted `AppNav`/`KaspiShopSidebar` breaks the build (grep for remaining imports before deleting).
- Functional: dropdown open/close (click + outside-click + Escape), active-state highlighting per route, mobile bottom bar still navigates correctly, `TopUtilityBar` wallet switching/top-up flow untouched and still working (regression check — this phase must not break existing wallet functionality even though it doesn't change wallet logic).
- Accessibility: keyboard nav through dropdowns, focus-visible states, `prefers-reduced-motion` respected for aurora drift and dropdown animations.
- Both color-scheme states if dark mode exists in the app already; if not, ship light-only per current app convention (don't introduce dark mode as a side effect of this phase — check `globals.css` for existing dark-mode support before deciding).
