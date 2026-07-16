# Desktop Version (Dashboard + Invoice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the invoice creation flow (`dashboard`) and invoice view flow (`invoice/[id]`) a real desktop layout at `lg:` (1024px+) — persistent sidebar nav + a live invoice preview panel, with Framer Motion animations — while leaving every page's mobile rendering byte-for-byte unchanged.

**Architecture:** Tailwind `lg:` responsive prefixes only (no separate route tree, no JS breakpoint detection). One new responsive nav component (`AppNav`, replacing `BottomNav`) that is a bottom bar under `lg:` and a left sidebar at `lg:+`. One new presentational component (`InvoiceLivePreview`) rendering a live on-brand approximation of an invoice, driven by props — used by both `dashboard` (fed by live form state) and `invoice/[id]` (fed by the loaded invoice record).

**Tech Stack:** Next.js App Router, TypeScript, Tailwind, Framer Motion (new dependency).

## Global Constraints

- **Zero mobile regression.** Every change is additive via `lg:`-prefixed classes or `hidden lg:block` / `lg:hidden` pairs. Below 1024px, every touched page must render pixel-identical to before this plan (verify by comparing DOM/screenshot at a sub-1024px viewport before and after each task).
- **Animation easing: smooth deceleration only.** Use `ease: [0.16, 1, 0.3, 1]` (ease-out-expo style) or Framer Motion's built-in `"easeOut"` for all transitions. Do **not** use bounce/spring-with-overshoot easing (e.g. `cubic-bezier(.34,1.56,.64,1)` or Framer's `type: "spring"` with default overshoot) — this was explicitly flagged as reading "dated/cheap" during this project's own design review of the brainstorm mockup for this feature.
- `AppNav` must preserve `BottomNav`'s existing unpaid-invoice-count badge behavior (queries `invoices` where `status in ('sent','overdue')` for the current user) and its 3 destinations (Create → `/dashboard`, History → `/history`, Profile → `/profile`) exactly.
- No new i18n dictionary work — reuse existing translated strings already available via `invoiceFlowDict`/`profileCore` etc. where the new components need text (e.g. nav labels already exist in `BottomNav`'s translated labels).
- No unit tests expected for this UI work (project convention — only `plan.test.ts`/`webhookSignature.test.ts` test pure logic). Verification is `tsc --noEmit`, `vitest run` (must stay 13/13), and manual browser checks at both a mobile (< 1024px) and desktop (≥ 1024px) viewport.

---

### Task 1: Add Framer Motion, build `AppNav`, wire into all 5 pages

**Files:**
- Modify: `package.json` (add `framer-motion` dependency)
- Create: `src/components/AppNav.tsx`
- Delete: `src/components/BottomNav.tsx` (superseded — check for and update any other importers beyond the 3 listed below via a repo-wide grep for `BottomNav` before deleting)
- Modify: `src/app/dashboard/page.tsx`, `src/app/history/page.tsx`, `src/app/profile/page.tsx` (swap `BottomNav` import/usage for `AppNav`)
- Modify: `src/app/invoice/[id]/page.tsx`, `src/app/invoice/[id]/edit/page.tsx` (add `AppNav` — currently render no nav component at all, on any screen size)

**Interfaces:**
- Produces: `export default function AppNav()` — no props, self-contained (matches `BottomNav`'s existing no-props signature), importable as `import AppNav from '@/components/AppNav'`.

- [ ] **Step 1: Install Framer Motion**

Run: `npm install framer-motion`

- [ ] **Step 2: Read `src/components/BottomNav.tsx` in full** (already translated in an earlier i18n pass — it has a `labels[lang]` record and a `useLanguage()` call). Note its exact `items` array (icon SVGs, hrefs, badge logic for the unpaid count via a `supabase.from('invoices')` query in a `useEffect`).

- [ ] **Step 3: Create `src/components/AppNav.tsx`**

Keep the exact same data/logic from `BottomNav` (the `useEffect` unpaid-count query, the `items` array with icon render functions, `labels[lang]`), but render two markup variants from one component:

```tsx
'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from './LanguageProvider'

// ... keep BottomNav's existing labels record and unpaid-count useEffect verbatim ...

export default function AppNav() {
  const router = useRouter()
  const path = usePathname()
  const { lang } = useLanguage()
  const [unpaid, setUnpaid] = useState(0)

  // ... keep the existing loadUnpaid useEffect verbatim ...

  const items = [ /* keep BottomNav's existing 3-item array verbatim, reusing labels[lang].create/history/profile and the existing icon(active) render functions */ ]

  const activeIndex = items.findIndex(i => path === i.href)

  return (
    <>
      {/* Mobile: bottom bar — identical markup/classes to the old BottomNav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex z-40">
        {items.map(item => {
          const active = path === item.href
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              className="flex-1 flex flex-col items-center py-3 gap-1 relative">
              <div className="relative">
                {item.icon(active)}
                {item.badge && item.badge > 0 ? (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
                    {item.badge > 9 ? '9+' : item.badge}
                  </div>
                ) : null}
              </div>
              <span className={`text-xs transition ${active ? 'text-[#1C2056] font-medium' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Desktop: left sidebar with an animated sliding active-indicator */}
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-20 bg-white border-r flex-col items-center py-6 gap-2 z-40">
        <div className="relative w-full flex flex-col items-center gap-2">
          {activeIndex >= 0 && (
            <motion.div
              className="absolute w-12 h-12 rounded-2xl bg-[#1C2056]"
              layoutId="appnav-active-indicator"
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
              style={{ top: activeIndex * 64 }}
            />
          )}
          {items.map((item, i) => {
            const active = path === item.href
            return (
              <button key={item.href} onClick={() => router.push(item.href)}
                className="relative w-12 h-12 rounded-2xl flex items-center justify-center z-10">
                {item.icon(active)}
                {item.badge && item.badge > 0 ? (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
                    {item.badge > 9 ? '9+' : item.badge}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
```

Note: `item.icon(active)` in `BottomNav` renders an SVG whose stroke/fill already depends on the `active` boolean passed in — reuse those render functions unchanged so icon colors keep working inside the sidebar's dark active pill (check contrast: if an icon's "active" color assumes a white background, adjust just that color case, since the sidebar's active state is a solid navy pill, not a white background — read the actual SVG code in `BottomNav` before assuming).

- [ ] **Step 4: Update the 3 existing importers**

In `src/app/dashboard/page.tsx`, `src/app/history/page.tsx`, `src/app/profile/page.tsx`: change `import BottomNav from '@/components/BottomNav'` to `import AppNav from '@/components/AppNav'`, and `<BottomNav />` to `<AppNav />`. Also add `lg:pl-20` (or equivalent left-padding matching the sidebar's `w-20`) to each page's outermost content wrapper so desktop content doesn't render underneath the new fixed sidebar — check the existing mobile bottom-padding (`pb-24`-style classes already present for the bottom nav) and add the equivalent `lg:` left-padding alongside it, not instead of it.

- [ ] **Step 5: Add `AppNav` to the 2 invoice pages**

In `src/app/invoice/[id]/page.tsx` and `src/app/invoice/[id]/edit/page.tsx`: import `AppNav`, render `<AppNav />` once in the returned JSX. Since neither page currently renders any nav, the mobile bottom-bar half of `AppNav` would newly appear on mobile for these 2 pages too — **prevent that**: wrap the whole `<AppNav />` usage in a fragment and instead render only the desktop half here, OR (simpler, prefer this) add a boolean prop `desktopOnly` to `AppNav` (default `false`) that, when true, skips rendering the `lg:hidden` bottom-bar block entirely and only renders the sidebar. Use `<AppNav desktopOnly />` on these 2 pages so mobile behavior there stays exactly as it is today (no nav at all below `lg:`), while desktop gains the sidebar. Add matching `lg:pl-20` to these 2 pages' outer wrapper as in Step 4.

- [ ] **Step 6: Delete `src/components/BottomNav.tsx`** once nothing imports it (re-grep to confirm).

- [ ] **Step 7: Typecheck and manual check**

Run: `npx tsc --noEmit` (0 errors) and `npx vitest run` (13/13).
Manually check all 5 pages at both a mobile viewport (< 1024px — must look identical to before) and a desktop viewport (≥ 1024px — sidebar appears, clicking between Create/History/Profile animates the active-indicator smoothly).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/components/AppNav.tsx src/app/dashboard/page.tsx src/app/history/page.tsx src/app/profile/page.tsx src/app/invoice/\[id\]/page.tsx src/app/invoice/\[id\]/edit/page.tsx
git rm src/components/BottomNav.tsx
git commit -m "add responsive AppNav sidebar/bottom-nav, replacing BottomNav"
```

---

### Task 2: Build `InvoiceLivePreview`

**Files:**
- Create: `src/components/InvoiceLivePreview.tsx`

**Interfaces:**
- Produces:
```ts
export interface InvoiceLivePreviewProps {
  invoiceNumber: string
  date: string
  companyName: string
  companyBin: string
  clientName: string
  clientBin: string
  services: { name: string; qty: number; price: number; unit?: string }[]
  note?: string
  vatType: 'no_vat' | 'vat_0' | 'vat_16'
  total: number
}
export default function InvoiceLivePreview(props: InvoiceLivePreviewProps)
```
This is consumed by Task 3 (fed from `dashboard/page.tsx`'s live form state) and Task 4 (fed from `invoice/[id]/page.tsx`'s loaded `invoice`/`profile` records) — both callers pass this exact shape.

- [ ] **Step 1: Build the component**

A flat, on-brand card (white on `#f9fafb`, navy `#1C2056` header text, mint `#2DC48D` for the total, `rounded-2xl`, `shadow-sm` — matching `DESIGN.md`'s existing card conventions, no new colors). Structure:
- Header: `invoiceNumber` + `date`.
- Client block: `clientName`, `clientBin`.
- Service line items: map `services`, each row `name × qty` on the left, `qty*price` formatted with `.toLocaleString('ru-KZ')` + ' ₸' on the right. Wrap the list in Framer Motion's `<AnimatePresence>` / `<motion.div layout>` per row (each row keyed by array index is acceptable here since this is a live, ephemeral preview, not a persisted list) so added/removed rows animate in/out — `initial={{ opacity: 0, x: -8 }}`, `animate={{ opacity: 1, x: 0 }}`, `exit={{ opacity: 0 }}`, `transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.25 }}`.
- VAT line if `vatType === 'vat_16'` (mirror the math already used elsewhere: `vatAmount = Math.round(total - total/1.16)`, `totalWithoutVat = Math.round(total/1.16)` — computed by the caller and passed via `services`/`total`, OR computed inside this component from `total`+`vatType`; prefer computing inside this component so callers just pass raw `total`/`vatType` and don't duplicate the VAT math — check `src/lib/generatePDF.ts` for the canonical VAT display strings/labels to match wording).
- Note line if `note` is non-empty.
- Total row: animate the number itself on change (a small `useEffect`-driven `requestAnimationFrame` count-up over ~400ms between the previous and new `total`, easing with the same `[0.16,1,0.3,1]` curve — mirrors the count-up demonstrated in this feature's approved brainstorm mockup). Keep this self-contained inside the component (a `useRef` for the previous value), not something callers manage.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — 0 errors. (No callers exist yet until Tasks 3-4 — this task just needs to compile standalone; you can temporarily render it in isolation, e.g. a throwaway `console.log`-free manual check via Storybook-less inline render in the dashboard page during development, but do not leave any temporary wiring committed.)

- [ ] **Step 3: Commit**

```bash
git add src/components/InvoiceLivePreview.tsx
git commit -m "add InvoiceLivePreview component"
```

---

### Task 3: Two-panel desktop layout in `dashboard/page.tsx`

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `InvoiceLivePreview` (Task 2) and its exact prop shape; `AppNav` (Task 1, already wired in Task 1 — no change needed here beyond what Task 1 did).
- The relevant live state already in this file: `clientName, clientBin, clientEmail, clientAddress, clientPhone, contractNumber, contractDate, note, services, total, vatType` (see file lines ~36-50) and `profile` (has `company_name`, `bin_iin`).

- [ ] **Step 1: Read the full invoice-creation section** of `src/app/dashboard/page.tsx` — from the top of the outer content wrapper (`<div className="max-w-lg mx-auto p-4">`, around line 387) down to the "Создать" button (around line 691) and the modals that follow. Identify precisely which JSX block is "the form" (client info card, services list card, note field) as distinct from the stats/plan-banner/onboarding sections that render above it — those stay full-width, untouched.

- [ ] **Step 2: Wrap only the form block** (not stats/banners/onboarding, not the modals) in a responsive two-column layout:
```tsx
<div className="lg:flex lg:gap-6 lg:items-start">
  <div className="lg:flex-1 lg:min-w-0">
    {/* existing form JSX: client info card, services list card, note field, create button — unchanged */}
  </div>
  <div className="hidden lg:block lg:w-[380px] lg:sticky lg:top-6">
    <InvoiceLivePreview
      invoiceNumber={/* next invoice number preview — reuse whatever prefix/number logic already exists for display, or a placeholder like profile?.invoice_prefix + profile?.invoice_next_number */}
      date={/* today's date, formatted consistently with the rest of the app — check src/lib/date.ts for the existing formatter */}
      companyName={profile?.company_name || ''}
      companyBin={profile?.bin_iin || ''}
      clientName={clientName}
      clientBin={clientBin}
      services={services}
      note={note}
      vatType={vatType}
      total={total}
    />
  </div>
</div>
```
Wrap the whole two-column container in a `<motion.div>` with a staggered fade/slide-up entrance (`initial={{opacity:0, y:12}}`, `animate={{opacity:1,y:0}}`, `transition={{ease:[0.16,1,0.3,1], duration:0.4}}`) matching the brainstorm mockup's panel entrance.

- [ ] **Step 3: Typecheck and manual check**

Run: `npx tsc --noEmit` (0 errors) + `npx vitest run` (13/13).
Manually verify: at < 1024px, the page renders identically to before this task (the wrapping `lg:flex` div is a no-op below `lg:`, confirm no visual change). At ≥ 1024px, the live preview appears alongside the form and updates as you type a client name / add a service line.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "add two-panel desktop layout with live preview to dashboard invoice creation"
```

---

### Task 4: Two-panel desktop layout in `invoice/[id]/page.tsx`

**Files:**
- Modify: `src/app/invoice/[id]/page.tsx`

**Interfaces:**
- Consumes: `InvoiceLivePreview` (Task 2). The loaded `invoice` record has `number, created_at, client_name, client_bin, services, note, amount` (the sum), and `profile` has `company_name, bin_iin`. Map `invoice.amount` → the `total` prop, `invoice.services` → the `services` prop (same `{name,qty,price,unit}` shape used elsewhere in this file already, e.g. in `buildProfile`/PDF-generation call sites — confirm exact field names by reading how `invoice.services` is already consumed elsewhere in this same file before wiring).

- [ ] **Step 1: Read the full page** from the outer content wrapper (`<div className="max-w-lg mx-auto p-4 space-y-4">`, around line 356) down to where the actions/buttons end and modals begin (around line 700+). Identify the boundary between "invoice summary + status + action buttons" (stays as the left column) and where modals/overlays start (stay untouched, outside the two-column wrapper).

- [ ] **Step 2: Wrap the details/actions block** in the same responsive pattern as Task 3:
```tsx
<div className="lg:flex lg:gap-6 lg:items-start">
  <div className="lg:flex-1 lg:min-w-0">
    {/* existing details/actions JSX — unchanged */}
  </div>
  <div className="hidden lg:block lg:w-[380px] lg:sticky lg:top-6">
    <InvoiceLivePreview
      invoiceNumber={invoice.number}
      date={formatDate(invoice.created_at)}
      companyName={profile?.company_name || ''}
      companyBin={profile?.bin_iin || ''}
      clientName={invoice.client_name || ''}
      clientBin={invoice.client_bin || ''}
      services={invoice.services || []}
      note={invoice.note || ''}
      vatType={profile?.vat_type || 'no_vat'}
      total={Number(invoice.amount)}
    />
  </div>
</div>
```
(`formatDate` is already imported in this file from `@/lib/date` per existing usage — confirm before assuming.) Same staggered entrance animation wrapper as Task 3.

- [ ] **Step 3: Typecheck and manual check**

Run: `npx tsc --noEmit` (0 errors) + `npx vitest run` (13/13).
Manually verify an existing invoice at both viewport sizes: mobile unchanged, desktop shows the live preview matching the real invoice's data (numbers, client, services, total all correct — this is reading, not editing, so the preview should be static/correct on load, no animation needed on the total beyond the initial mount).

- [ ] **Step 4: Commit**

```bash
git add src/app/invoice/\[id\]/page.tsx
git commit -m "add two-panel desktop layout with live preview to invoice view page"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1:** `npx tsc --noEmit` — 0 errors.
- [ ] **Step 2:** `npx vitest run` — 13/13 passing.
- [ ] **Step 3:** Manual browser pass (report to user, do not skip): log in as a real user; at a viewport < 1024px, click through Create/History/Profile and open an invoice — confirm every page looks and behaves exactly as it did before this plan (bottom nav present, single column, no live preview visible). At a viewport ≥ 1024px, repeat — confirm the sidebar appears with a smoothly animating active-indicator, invoice creation and invoice view both show the live preview panel updating correctly, and no layout is broken on `history`/`profile` (which intentionally did NOT get the two-panel treatment, only the sidebar swap from Task 1 — confirm they still render as a single centered column on desktop, just with the new sidebar instead of a bottom bar).
