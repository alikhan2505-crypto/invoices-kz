# Desktop version — dashboard + invoice creation/view

## Problem

The app (everything behind login) has zero desktop-specific layout today — every page is a `max-w-lg mx-auto` mobile column that just floats in empty space on a wide screen (confirmed live on invoices.kz: `/login` renders as a small centered card on a 1440px viewport with no content on either side). The landing page (`src/app/page.tsx`) already has a bold, modern, animated desktop design and is out of scope here — this spec covers the logged-in app.

Per `PRODUCT.md`, desktop must not break the mobile flow — this is an additive, responsive treatment, not a parallel app.

## Approved direction (from brainstorming)

**Variant A — Sidebar + live preview**, chosen over a "wide canvas" (minimal-change) and a "bento grid + command bar" (bigger swing) option, with an explicit ask for "cool animations" added on top of the base layout — confirmed against an interactive animated mockup (sliding active-indicator in the sidebar, staggered panel entrance, animated line-item insert, count-up total).

## Scope

**In scope**, activated only at Tailwind's `lg:` breakpoint (1024px+); below that, zero visual/behavioral change from the current mobile experience:
1. **`src/app/dashboard/page.tsx`** — the invoice creation flow gets a two-panel desktop layout: form on the left, a live-updating invoice preview on the right that reflects the form state as the user types/adds services.
2. **`src/app/invoice/[id]/page.tsx`** — the existing-invoice view gets a two-panel desktop layout: details/actions on the left, the same preview component on the right rendering that invoice's actual data.
3. A new responsive navigation shell, replacing the current mobile-only `BottomNav`: renders as a fixed bottom bar under `lg:` (pixel-identical to today) and as a fixed left sidebar at `lg:+`. Added to `src/app/invoice/[id]/page.tsx` and `src/app/invoice/[id]/edit/page.tsx` too (both currently render no nav at all, on any screen size) so desktop users keep persistent navigation on every screen in this flow — this only adds a `lg:`-only sidebar, mobile behavior on these two pages is unchanged (still no bottom nav there).

**Out of scope for this pass** (explicitly deferred, not silently dropped):
- `src/app/invoice/[id]/edit/page.tsx` gets the new nav shell (see above) but not a two-panel live-preview redesign — editing is lower-traffic than create/view.
- `src/app/history/page.tsx`, all of `src/app/profile/**` — still mobile-only layout; the new nav shell is not added there in this pass. (They already render `BottomNav`, unaffected.)
- Any change to the landing page, admin panel, or auth pages.

## Architecture

- **New dependency: `framer-motion`.** No animation library exists in the project today (`grep` confirms). Framer Motion is the standard choice for the spring/layout/exit animations this design calls for (sliding active-indicator, `AnimatePresence` for service-row insert, staggered panel entrance). Use smooth deceleration easing (`ease: [0.16, 1, 0.3, 1]` / "ease-out-expo" style) — **not** bounce/overshoot easing (`cubic-bezier(.34,1.56,.64,1)`-style curves read as dated per this session's own design-hook feedback on the brainstorm mockup).
- **New component `src/components/AppNav.tsx`** replacing `src/components/BottomNav.tsx` (rename/replace, not duplicate — same unpaid-invoice-count badge logic, same 3 destinations: Create/Dashboard, History, Profile). Renders bottom-bar markup under `lg:`, sidebar markup at `lg:+`, via Tailwind responsive classes in one component — not two components picked by JS breakpoint detection, so there's no layout flash and no client-side matchMedia logic.
- **New component `src/components/InvoiceLivePreview.tsx`** — presentational, takes the same shape of props the PDF generators take (company/client info, services, totals, vat type) and renders a live, on-brand (navy/mint, flat cards) approximation of the invoice. This is a new lightweight React render, not a reuse of `generatePDF.ts`'s HTML-string output (that remains the print/PDF path, unchanged).
- Both `dashboard/page.tsx` and `invoice/[id]/page.tsx` wrap their two-panel section in a `hidden lg:flex` / mobile-single-column pair so mobile markup is untouched and desktop gets the new split — the same pattern already used for other responsive tweaks in this codebase (Tailwind responsive prefixes, no separate route/component tree).

## Out of scope

- Any new i18n dictionary work (the desktop shell reuses existing translated strings from `invoiceFlowDict`/`profileCore` etc. — no new user-facing copy).
- Backend/API changes — this is presentation-only.
