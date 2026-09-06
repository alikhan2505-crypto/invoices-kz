# Onboarding Segmentation + Dashboard Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New signups land on the dashboard with their trial already granted, and are shown a 4-step spotlight tour once; invoice requisites are asked only when the user actually goes to create an invoice.

**Architecture:** `/auth/callback` takes over the four universal jobs that `/onboarding`'s step 1 currently bundles (create the profile row, referral, promo+trial grant, founder notification) and drops the requisites gate. A new self-contained `DashboardTour.tsx` draws a four-rectangle scrim around a `data-tour` anchor, portaled to `document.body`, and records completion in a new non-privileged `profiles.tour_completed_at` column.

**Tech Stack:** Next.js 15 (App Router, client components), React 19, Tailwind v4, framer-motion, Supabase (Postgres + JS client), TypeScript.

## Global Constraints

- **The tour overlay MUST be rendered via `createPortal(..., document.body)`.** `globals.css` puts `backdrop-filter` on the `<main>` wrapping every page, which in WebKit makes that element a containing block for `position:fixed` AND its own stacking context. This is the exact trap that broke the mobile drawer on 2026-09-06 (fixed in `ed46824`): content rendered off-screen when scrolled, and `z-index` could not rescue it.
- **The trial must still be granted by `/api/onboarding/grant`, never by a client write.** The `protect_profile_privileged_columns` trigger force-nulls `trial_expires_at` on INSERT for non-service-role callers. The profile row must exist *before* that route is called.
- `profiles.tour_completed_at` is NOT in the trigger's pinned list, so the client may write it directly — no service-role route.
- Requisites stay mandatory *for issuing an invoice*: `/create`'s existing gate is not touched. Only the moment of asking moves.
- Every tap target ≥44×44px (`w-11 h-11`), per DESIGN.md.
- Gate before each commit: `npx tsc --noEmit`, `npm test` (49 files / 520 tests), `npm run build`.
- Commit directly to `main`; do not branch. Do not push (the controller pushes the batch).

## File Structure

- `src/app/auth/callback/page.tsx` — post-login routing + new-user bootstrap. Modified.
- `src/components/DashboardTour.tsx` — **new.** The whole tour: step data, anchor measurement, scrim, tooltip, completion write. Self-contained so the dashboard only mounts it.
- `src/app/dashboard/page.tsx` — mounts the tour, plus `data-tour` anchors. Modified.
- `src/components/SiteNav.tsx` / `src/components/TopUtilityBar.tsx` — one `data-tour` attribute each. Modified.
- Supabase migration — one column.

---

### Task 1: Add the `tour_completed_at` column

**Files:** none in the repo — this is a Supabase migration on project `terjitbqgrjlqezyydql`.

**Interfaces:**
- Produces: `profiles.tour_completed_at timestamptz NULL`, readable and writable by the owning user.

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP tool `apply_migration` with `project_id: terjitbqgrjlqezyydql`, `name: add_tour_completed_at_to_profiles`:

```sql
ALTER TABLE profiles ADD COLUMN tour_completed_at timestamptz;
```

- [ ] **Step 2: Reload the PostgREST schema cache**

Use `execute_sql` with `project_id: terjitbqgrjlqezyydql`:

```sql
NOTIFY pgrst, 'reload schema';
```

This is not optional. On 2026-09-05 a new column was added without it and every insert referencing that column failed live with `Could not find the 'bank_id' column of 'invoices' in the schema cache`.

- [ ] **Step 3: Verify the column exists and is not pinned by the trigger**

Use `execute_sql`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='tour_completed_at';
```

Expected: exactly one row, `timestamptz`, `is_nullable = YES`.

Then confirm the trigger does not pin it:

```sql
SELECT pg_get_functiondef(p.oid) LIKE '%tour_completed_at%' AS is_pinned
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'protect_profile_privileged_columns';
```

Expected: `is_pinned = false`. If it is true, stop and report — the client write in Task 3 would be silently reverted.

- [ ] **Step 4: Report**

No commit — this task changes no repo files. Record the migration name and the verification output in your report.

---

### Task 2: Signup lands on the dashboard, with the trial

**Files:**
- Modify: `src/app/auth/callback/page.tsx` — the profile lookup and the `if (!profile?.bin_iin)` branch

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing later tasks read.

- [ ] **Step 1: Change the profile lookup so "no row" is distinguishable from "row without requisites"**

Currently the lookup selects `bin_iin, company_name` with `.single()`, which errors when no row exists and collapses both cases into one. Replace it:

```tsx
        // `id` (not bin_iin) because the question this branch asks is "does a
        // profile row exist at all", not "are the invoice requisites filled".
        // A Kaspi-Shop-only user legitimately has a row with an empty bin_iin
        // and must NOT be bootstrapped a second time. maybeSingle() so the
        // no-row case is null instead of an error.
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle()
```

- [ ] **Step 2: Replace the onboarding branch with the new-user bootstrap**

Replace this entire branch:

```tsx
        if (!profile?.bin_iin) {
          // New/incomplete profile: must finish onboarding first, so a
          // pending upgrade is left untouched for /upgrade to pick up
          // whenever the user gets there later -- never skip onboarding.
          const ref = localStorage.getItem('referral_code')
          router.push(ref ? `/onboarding?ref=${ref}` : '/onboarding')
        } else if (hasPendingUpgrade()) {
```

with:

```tsx
        if (!profile) {
          // Brand-new account. /onboarding's step 1 used to do all of this
          // AND demand company name + BIN before any of it ran, which meant a
          // seller who came only for Kaspi Bot or the AI agent had to invent
          // invoice requisites to get past the door -- and, if they bounced,
          // never got their trial. The requisites question now lives at
          // /create, which already gates on it; everything else that step 1
          // did for EVERY user happens here instead.
          //
          // Order matters: the row must exist before /api/onboarding/grant
          // runs, because protect_profile_privileged_columns force-nulls
          // trial_expires_at on a non-service-role INSERT.
          await supabase.from('profiles').upsert({
            id: session.user.id,
            email: session.user.email,
          })

          const refCode = localStorage.getItem('referral_code') || ''
          if (refCode) {
            try {
              await fetch('/api/referral', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ userId: session.user.id, referralCode: refCode }),
              })
            } catch {}
            localStorage.removeItem('referral_code')
          }

          const promoCode = localStorage.getItem('promo_code') || ''
          const requestGrant = () => fetch('/api/onboarding/grant', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ promoCode: promoCode || undefined }),
          })
          // One retry, then give up quietly: unlike the old wizard there is no
          // form to hold the user on, and blocking the very first screen on a
          // flaky network would be worse than a missing trial the founder can
          // grant by hand. A failure is logged, not alerted.
          try {
            let grantRes = await requestGrant()
            if (!grantRes.ok) grantRes = await requestGrant()
            if (!grantRes.ok) console.error('signup: trial grant failed', grantRes.status)
            else if (promoCode) localStorage.removeItem('promo_code')
          } catch (e: any) {
            console.error('signup: trial grant threw', e?.message)
          }

          try {
            await fetch('/api/telegram', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                message: `🆕 <b>Новый пользователь!</b>\n📧 ${session.user.email}${refCode ? '\n🎁 Реферал: ' + refCode : ''}${promoCode ? '\n🏷 Промокод: ' + promoCode : ''}`,
              }),
            })
          } catch {}

          router.push('/dashboard')
        } else if (hasPendingUpgrade()) {
```

Note the Telegram message no longer carries company name or BIN — at signup they do not exist yet. Do not reintroduce them.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Tests and build**

Run: `npm test`
Expected: `Test Files 49 passed (49)`, `Tests 520 passed (520)`.

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/callback/page.tsx
git commit -m "feat(onboarding): signup lands on the dashboard with the trial already granted"
```

---

### Task 3: The dashboard tour

**Files:**
- Create: `src/components/DashboardTour.tsx`
- Modify: `src/app/dashboard/page.tsx` (mount + two anchors)
- Modify: `src/components/SiteNav.tsx` (one anchor on the mobile «<» button)
- Modify: `src/components/TopUtilityBar.tsx` (one anchor on the pill)

**Interfaces:**
- Consumes: `profiles.tour_completed_at` from Task 1.
- Produces: `<DashboardTour />`, a default-exported component taking no props.

- [ ] **Step 1: Create the component**

Create `src/components/DashboardTour.tsx`:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'

type Step = { anchor: string; title: string; body: string }

// Anchors are data-tour attributes on elements that already exist; the tour
// never renders its own copy of them. A step whose anchor is missing from the
// DOM (e.g. the mobile-only menu button on a desktop viewport) is skipped
// rather than pointing at nothing.
const STEPS: Step[] = [
  {
    anchor: 'products',
    title: 'Четыре продукта на одной платформе',
    body: 'Счета, приём оплат Kaspi, ИИ-агент и Kaspi Bot. Начните с любого — остальные подключите когда понадобятся.',
  },
  {
    anchor: 'create-invoice',
    title: 'Первый счёт — за минуту',
    body: 'Реквизиты компании спросим здесь же, в момент создания, а не заранее.',
  },
  {
    anchor: 'menu',
    title: 'Всё меню здесь',
    body: 'Разделы и их страницы. Открытым показывается только тот раздел, в котором вы сейчас.',
  },
  {
    anchor: 'wallet',
    title: 'Единый кошелёк',
    body: 'С него списывается комиссия за счета, проверки Kaspi Bot и ответы ИИ-агента. Один баланс на всю платформу.',
  },
]

const PAD = 6      // breathing room around the highlighted element
const GAP = 10     // distance from the element to the tooltip
const MARGIN = 12  // minimum distance from the viewport edges

export default function DashboardTour() {
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [vw, setVw] = useState(0)
  const [vh, setVh] = useState(0)

  // Decide once, on mount, whether this account has seen the tour. A missing
  // profile row (or any error) means "don't show" -- the tour is a nicety and
  // must never be the thing that breaks a dashboard load.
  //
  // Yes, dashboard/page.tsx already fetches this profile for its own reasons,
  // so this is a second read of the same row. That is a deliberate trade: one
  // indexed primary-key lookup buys a component that mounts anywhere with no
  // props and no coupling to the dashboard's loading state. If the dashboard's
  // first paint ever becomes the thing to optimise, pass the flag in as a prop
  // then -- not before.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('tour_completed_at')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled && data && !data.tour_completed_at) setOpen(true)
    })()
    return () => { cancelled = true }
  }, [])

  const measure = useCallback(() => {
    const step = STEPS[i]
    if (!step) return
    const el = document.querySelector(`[data-tour="${step.anchor}"]`)
    setVw(window.innerWidth)
    setVh(window.innerHeight)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [i])

  useEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, measure])

  const finish = useCallback(async () => {
    setOpen(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles')
      .update({ tour_completed_at: new Date().toISOString() })
      .eq('id', user.id)
  }, [])

  const next = useCallback(() => {
    // Skip forward over any step whose anchor isn't on this viewport.
    for (let j = i + 1; j < STEPS.length; j++) {
      if (document.querySelector(`[data-tour="${STEPS[j].anchor}"]`)) { setI(j); return }
    }
    finish()
  }, [i, finish])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  // Scroll the anchor into view when a step opens, so a highlight never lands
  // off-screen on a long dashboard. Honours prefers-reduced-motion: for those
  // users the jump is instant rather than animated.
  useEffect(() => {
    if (!open) return
    const el = document.querySelector(`[data-tour="${STEPS[i].anchor}"]`)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    const t = setTimeout(measure, reduce ? 0 : 400)
    return () => clearTimeout(t)
  }, [open, i, measure])

  if (!open || typeof document === 'undefined') return null
  const step = STEPS[i]
  if (!step) return null

  const scrim = 'rgba(10,10,15,0.55)'
  // Four opaque rectangles around the target instead of a mask/clip-path:
  // those two differ across engines, four plain divs do not.
  const box = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null

  const below = box ? box.top + box.height / 2 < vh * 0.6 : true
  const tipWidth = Math.min(320, vw - MARGIN * 2)
  const tipLeft = box
    ? Math.max(MARGIN, Math.min(box.left, vw - tipWidth - MARGIN))
    : MARGIN
  const tipStyle: React.CSSProperties = box
    ? below
      ? { top: box.top + box.height + GAP, left: tipLeft, width: tipWidth }
      : { bottom: vh - box.top + GAP, left: tipLeft, width: tipWidth }
    : { top: '50%', left: MARGIN, width: tipWidth, transform: 'translateY(-50%)' }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Знакомство с платформой"
      className="fixed inset-0 z-[80]"
    >
      {box ? (
        <>
          <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: Math.max(0, box.top), background: scrim }} onClick={finish} />
          <div style={{ position: 'fixed', left: 0, top: box.top + box.height, width: '100%', bottom: 0, background: scrim }} onClick={finish} />
          <div style={{ position: 'fixed', left: 0, top: box.top, width: Math.max(0, box.left), height: box.height, background: scrim }} onClick={finish} />
          <div style={{ position: 'fixed', left: box.left + box.width, top: box.top, right: 0, height: box.height, background: scrim }} onClick={finish} />
          <div
            style={{
              position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height,
              border: '2px solid var(--nav-accent)', borderRadius: 14, pointerEvents: 'none',
              boxShadow: '0 0 0 4px rgba(91,76,224,0.25)',
            }}
          />
        </>
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: scrim }} onClick={finish} />
      )}

      <div
        className="fixed rounded-2xl p-4 nav-glass"
        style={{ ...tipStyle, boxShadow: '0 24px 50px -20px rgba(10,10,15,0.45)' }}
      >
        <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--nav-text-muted)' }}>
          {i + 1} из {STEPS.length}
        </div>
        <div className="font-semibold text-sm mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
          {step.title}
        </div>
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
          {step.body}
        </p>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={finish}
            className="min-h-[44px] px-3 text-[13px] font-medium rounded-xl"
            style={{ color: 'var(--nav-text-muted)' }}
          >
            Пропустить
          </button>
          <button
            onClick={next}
            className="min-h-[44px] px-5 text-[13px] font-semibold rounded-xl"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
          >
            {i === STEPS.length - 1 ? 'Готово' : 'Далее'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

- [ ] **Step 2: Add the two dashboard anchors and mount the tour**

In `src/app/dashboard/page.tsx`:

Add the import beside the other component imports at the top of the file:

```tsx
import DashboardTour from '@/components/DashboardTour'
```

Anchor the product grid — find the products grid opening tag, currently:

```tsx
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

and add the attribute:

```tsx
            <div data-tour="products" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

Anchor the create-invoice button — it is the full-width one near the end of the page whose label is `Создать счёт` and whose `onClick` is `() => router.push('/create')` (around line 978). Add `data-tour="create-invoice"` to that button's opening tag, changing nothing else about it.

Mount the tour as the last child inside the page's outermost `<main>`, immediately before its closing `</main>`:

```tsx
      <DashboardTour />
```

- [ ] **Step 3: Add the nav and pill anchors**

In `src/components/SiteNav.tsx`, on the mobile sticky bar's «<» button (the one with `aria-label={labels[lang].menu}` and `onClick={() => setDrawerOpen(true)}`), add `data-tour="menu"` to its opening tag. Change nothing else.

In `src/components/TopUtilityBar.tsx`, on the outer pill container (the `<div>` whose className begins `fixed top-1.5 lg:top-[21px] right-3 lg:right-6 z-50`), add `data-tour="wallet"`. Change nothing else.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Tests and build**

Run: `npm test`
Expected: `Test Files 49 passed (49)`, `Tests 520 passed (520)`.

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardTour.tsx src/app/dashboard/page.tsx src/components/SiteNav.tsx src/components/TopUtilityBar.tsx
git commit -m "feat(onboarding): 4-step spotlight tour on the dashboard, shown once per account"
```

---

### Task 4: Deploy and verify live

**Files:** none — verification only.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Confirm the deployment**

Vercel MCP `list_deployments` with `projectId: prj_DhkQz2JKsUZ6nNv75uj60FOYsLo6`, `teamId: team_0n5m30JHsf0QUhcrLiq2B4KZ`; take the newest id, then `get_deployment`. Do not grep JS bundles — that produced a false positive earlier in this project.

Expected together: `"readyState": "READY"`, `githubCommitSha` equal to `git rev-parse HEAD`, and `"invoices.kz"` present in `alias`.

- [ ] **Step 3: Verify in WebKit, not Chromium**

The engine matters: the containing-block trap this plan guards against is invisible in Chromium. Install WebKit if needed (`npx playwright install webkit`) and drive it at 390×844.

Use a fresh account so the tour and the trial are both exercised. Assert:
1. After login the URL is `/dashboard` — not `/onboarding`.
2. `profiles.trial_expires_at` for that user is not null (check with the Supabase MCP `execute_sql`).
3. The tour is visible: an element with `[role="dialog"][aria-label="Знакомство с платформой"]` exists.
4. The highlight sits on the right element — the ring's `boundingBox()` overlaps the `[data-tour="products"]` element's own box on step 1.
5. The tooltip is inside the viewport: its box `x >= 0` and `x + width <= 390`.
6. «Пропустить» closes it and sets `tour_completed_at`; after `page.reload()` the dialog does not come back.

- [ ] **Step 4: Hand back to the founder**

Report what was verified, and ask him to confirm on his own iPhone with a fresh account — that is the device and the flow the change is for.

---

## Follow-up (NOT part of this plan)

`/onboarding` is now reachable but no longer linked from anywhere. Decide later whether to point the Счета card at it for users without requisites, or to retire it in favour of `/profile/requisites`. Deliberately left alone here so this change stays reversible.
