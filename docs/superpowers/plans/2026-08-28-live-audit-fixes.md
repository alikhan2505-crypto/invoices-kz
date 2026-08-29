# Live Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 real, verified findings from a live production audit: landing-page text contrast, gradient text, missing `<main>` landmark, site-wide disabled zoom, a dashboard footer/wallet-pill collision on mobile, and a visible native scrollbar on `/history`.

**Architecture:** Six independent CSS/markup-only changes across four files, grouped into four tasks by file. No new logic, no new components, no schema changes.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS.

## Global Constraints

- Every fix is a pure CSS/markup change on an existing element — no new automated tests, matching this codebase's treatment of identical-in-kind prior changes (the tap-zone sweep, the merchantId tooltip task).
- Verification is `tsc --noEmit` + a live re-check (re-run Lighthouse on the landing page, screenshot `/dashboard` and `/history`) — no code-level test framework applies here.

---

### Task 1: Landing page — contrast, gradient text, `<main>` landmark

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:** None — self-contained page component, no exports consumed elsewhere.

- [ ] **Step 1: Bump the "quiet" opacity tier (0.25 / 0.35 / 0.4 → 0.68)**

Run three `replace_all` edits, one per distinct old value, all mapping to the same new value `rgba(255,255,255,0.68)`:

- Every occurrence of `color: 'rgba(255,255,255,0.25)'` → `color: 'rgba(255,255,255,0.68)'`
- Every occurrence of `color: 'rgba(255,255,255,0.35)'` → `color: 'rgba(255,255,255,0.68)'`
- Every occurrence of `color: 'rgba(255,255,255,0.4)'` → `color: 'rgba(255,255,255,0.68)'`

- [ ] **Step 2: Bump the "readable-muted" opacity tier (0.5 / 0.55 / 0.6 / 0.64 → 0.82)**

Run four `replace_all` edits, one per distinct old value, all mapping to `rgba(255,255,255,0.82)`:

- Every occurrence of `color: 'rgba(255,255,255,0.5)'` → `color: 'rgba(255,255,255,0.82)'`
- Every occurrence of `color: 'rgba(255,255,255,0.55)'` → `color: 'rgba(255,255,255,0.82)'`
- Every occurrence of `color: 'rgba(255,255,255,0.6)'` → `color: 'rgba(255,255,255,0.82)'`
- Every occurrence of `color: 'rgba(255,255,255,0.64)'` → `color: 'rgba(255,255,255,0.82)'`

Do NOT touch `0.06`, `0.8`, `0.85`, `0.9` — those are already safe or are non-text (background/border) uses.

- [ ] **Step 3: Replace the gradient-clip hero headline with a solid color**

Find:
```tsx
                <span
                  style={{
                    background: `linear-gradient(120deg, ${COLOR.violet}, ${COLOR.teal})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {t.heroTitleLine2}
                </span>
```

Replace with:
```tsx
                <span style={{ color: COLOR.teal }}>
                  {t.heroTitleLine2}
                </span>
```

- [ ] **Step 4: Wrap the page's real content in `<main>`**

Find:
```tsx
      </header>

      {/* --------------------------------------------------------- hero */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
```

Replace with:
```tsx
      </header>

      <main>
      {/* --------------------------------------------------------- hero */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
```

Then find:
```tsx
      </section>

      {/* ------------------------------------------------------- footer */}
      <footer className="relative z-10 mx-auto max-w-6xl px-5 py-10 sm:px-8" style={{ borderTop: `1px solid ${border}` }}>
```

Replace with:
```tsx
      </section>
      </main>

      {/* ------------------------------------------------------- footer */}
      <footer className="relative z-10 mx-auto max-w-6xl px-5 py-10 sm:px-8" style={{ borderTop: `1px solid ${border}` }}>
```

(The inner content's own indentation is deliberately left as-is — re-indenting everything between header and footer would produce a huge, purely cosmetic diff for what is otherwise a semantic-only wrapper.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean pass).

---

### Task 2: Site-wide mobile zoom re-enabled

**Files:**
- Modify: `src/app/layout.tsx`

**Interfaces:** `viewport` export consumed by Next.js's App Router metadata system — removing one key doesn't change its shape, no other file references `maximumScale`.

- [ ] **Step 1: Remove `maximumScale: 1`**

Find:
```tsx
export const viewport: Viewport = {
  themeColor: '#1C2056',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}
```

Replace with:
```tsx
export const viewport: Viewport = {
  themeColor: '#1C2056',
  width: 'device-width',
  initialScale: 1,
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean pass).

---

### Task 3: Dashboard footer no longer collides with the wallet pill

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:** None — page-local layout classes only.

- [ ] **Step 1: Make the footer stack vertically on mobile**

Find:
```tsx
            <div className="flex flex-wrap items-center justify-between gap-4">
```

Replace with:
```tsx
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
```

- [ ] **Step 2: Increase bottom clearance for the now-taller stacked footer**

Find:
```tsx
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
```

Replace with:
```tsx
      <main className="page-surface-in-shell min-h-screen pb-32 lg:pb-6 lg:min-h-full">
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean pass).

---

### Task 4: Hide the native scrollbar on `/history`'s filter rows

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/history/page.tsx`

**Interfaces:**
- Produces: a new `.hide-scrollbar` CSS utility class, usable by any future horizontally-scrolling row in this codebase (mirrors the existing `.desktop-shell-scroll` precedent, but under a generic name instead of a desktop-shell-specific one).

- [ ] **Step 1: Add the `.hide-scrollbar` utility**

In `src/app/globals.css`, find:
```css
.desktop-shell-scroll {
  scrollbar-width: none;
}
```

Replace with:
```css
.desktop-shell-scroll {
  scrollbar-width: none;
}

/* Generic version of the rule above for any horizontally-scrolling row
   (e.g. /history's filter pills) that wants touch-scroll without the
   native scrollbar bar drawn on top of its content. */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  scrollbar-width: none;
}
```

- [ ] **Step 2: Apply it to both filter rows**

In `src/app/history/page.tsx`, find:
```tsx
            className="flex gap-2 mb-3 overflow-x-auto pb-1"
```

Replace with:
```tsx
            className="flex gap-2 mb-3 overflow-x-auto pb-1 hide-scrollbar"
```

Then find:
```tsx
            className="flex gap-2 mb-4 overflow-x-auto pb-1"
```

Replace with:
```tsx
            className="flex gap-2 mb-4 overflow-x-auto pb-1 hide-scrollbar"
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean pass).

---

### Task 5: Commit, push, and live-verify all four fixes

**Files:** None (verification only).

- [ ] **Step 1: Commit everything together**

```bash
git add src/app/page.tsx src/app/layout.tsx src/app/dashboard/page.tsx src/app/globals.css src/app/history/page.tsx
git commit -m "fix: live audit fixes -- landing contrast/gradient text/main landmark, site-wide zoom, dashboard footer collision, history scrollbar"
```

- [ ] **Step 2: Push and deploy**

```bash
git pull --rebase --autostash origin main
git push origin main
```

- [ ] **Step 3: Wait for the Vercel deployment for this commit to reach READY**, then re-run the same Lighthouse mobile audit used during the original audit against `https://www.invoices.kz/`. Expected: the `color-contrast`, `viewport` (maximum-scale), and `landmark-one-main` audits now pass (score 0 → not failing); Accessibility category score should rise from 87.

- [ ] **Step 4: Take a mobile-viewport (390×844) screenshot of `/dashboard` scrolled to the bottom** (as an authenticated user) and confirm the WhatsApp/Email/Telegram footer links are no longer covered by the wallet pill.

- [ ] **Step 5: Take a mobile-viewport screenshot of `/history`** and confirm no visible scrollbar bar under the date/status filter rows.

---

## Self-Review

**Spec coverage:** Spec item 1 (contrast) → Task 1 Steps 1-2. Spec item 2 (gradient text) → Task 1 Step 3. Spec item 3 (zoom) → Task 2. Spec item 4 (`<main>`) → Task 1 Step 4. Spec item 5 (dashboard footer) → Task 3. Spec item 6 (history scrollbar) → Task 4. Spec's Testing section (tsc + live Lighthouse/screenshot re-check, no new automated tests) → each task's tsc step plus Task 5.

**Placeholder scan:** No TBD/TODO; every step shows exact before/after code or an exact command with expected output.

**Type consistency:** N/A — no shared types/functions/signatures introduced across these tasks; each is a self-contained className/style/JSX-structure edit in its own file.
