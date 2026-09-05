# Mobile Nav Chrome Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three bottom-clustered mobile nav elements (floating hamburger, floating utility pill, 6-tab bottom bar) with one sticky top row carrying a «<» drawer trigger on the left and the four utilities on the right, and make the drawer's section headers readable.

**Architecture:** Both changes live in two already-shared components. `SiteNav.tsx` gains a `lg:hidden sticky top-0` row (mirroring its own existing desktop `sticky top-0` nav) and loses its bottom tab bar and floating hamburger; `TopUtilityBar.tsx` only changes its mobile positioning classes from bottom to top. Sticky (not fixed) is the load-bearing decision: it rides normal document flow, so no page needs a new `padding-top`.

**Tech Stack:** Next.js 15 (App Router, client components), React 19, Tailwind v4, framer-motion (`AnimatePresence` for the drawer), TypeScript.

## Global Constraints

- **The top bar is `sticky top-0`, never `fixed`.** A fixed bar needs `padding-top` on ~74 pages — the exact sweep reverted twice in August (`2a1cb30`, `481cdc7` → `c7ea68b`).
- **Desktop (`lg:`) must not change at all** — not the two-row nav, not the utility pill's `lg:top-[21px] lg:right-6`.
- Top bar height is exactly `h-14` (56px). ~~the utility pill sits at `top-1.5` (6px) so its 44px height centres in that 56px~~ — **CORRECTED mid-execution (2026-09-05, after Task 2's review):** the pill is NOT 44px. Measured live with Playwright at 390×844: **57.6px** — its 44px buttons plus its own `py-1.5` (12px) and `.nav-glass`'s 0.8px top+bottom border. A 56px bar is therefore *shorter* than the pill and it overhangs by ~7px. Founder's call: keep the bar at 56px and shrink the pill on mobile only — its container drops vertical padding (`py-1.5` → `py-0 lg:py-1.5`), giving ~45.6px, which sits inside the 56px bar. The 44px buttons inside are untouched, so the tap-target rule still holds.
- `z-index`: top bar `z-40`, utility pill keeps its existing `z-50`.
- Every tap target ≥44×44px (`w-11 h-11`), per DESIGN.md's Icon Action Buttons rule.
- All three languages stay wired: any new user-visible string goes through the existing `labels[lang]` dict in `SiteNav.tsx` (ru/kk/en), never a hardcoded literal.
- **`pb-24` cleanup across 51 files is OUT OF SCOPE here** — separate follow-up commit after the founder confirms this one works.
- Gate before every commit: `npx tsc --noEmit`, `npm test` (520 tests must stay green), `npm run build`.

## File Structure

- `src/components/SiteNav.tsx` — owns the mobile top bar (new), the drawer (restyled headers), and loses the floating hamburger + bottom tab bar. One file because all of it is the same component's mobile chrome; splitting it would mean threading `drawerOpen`, `isAdmin`, `isPro`, `lockedHint` state across a new boundary for no gain.
- `src/components/TopUtilityBar.tsx` — one className change on its outer container. Untouched otherwise.

No new files. No new dependencies.

---

### Task 1: Mobile top bar + remove the floating hamburger

**Files:**
- Modify: `src/components/SiteNav.tsx:121-144` (add `ChevronLeftIcon` beside the existing local icon components)
- Modify: `src/components/SiteNav.tsx:199-215` (replace the floating hamburger block with the sticky top bar)

**Interfaces:**
- Consumes: existing component state `drawerOpen`/`setDrawerOpen`, `labels[lang].menu`, `desktopOnly` prop.
- Produces: a `lg:hidden sticky top-0 z-40 h-14` bar rendered as the first element of the component's returned fragment. Task 2 positions the utility pill against its `h-14`/`z-40`.

- [ ] **Step 1: Add the ChevronLeftIcon component**

In `src/components/SiteNav.tsx`, directly after the existing `CloseIcon` function (which ends at line 144), add:

```tsx
// Same mark the profile-section headers use (e.g. profile/banks/page.tsx) --
// duplicated locally rather than shared, matching how LockIcon/MenuIcon/
// CloseIcon are already declared in this file.
function ChevronLeftIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}
```

- [ ] **Step 2: Replace the floating hamburger with the sticky top bar**

In `src/components/SiteNav.tsx`, replace this entire block (currently lines 201-215, the comment plus the `{!desktopOnly && (<button ...MenuIcon.../>)}`):

```tsx
      {/* Mobile: floating menu trigger, bottom-left — mirrors TopUtilityBar's
          wallet pill (fixed bottom-20 right-3) so both thumb corners carry one
          control each. Opens the left drawer with every section's subpages,
          which the desktop-only second tab row otherwise leaves unreachable
          on mobile. */}
      {!desktopOnly && (
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label={labels[lang].menu}
          className="lg:hidden fixed bottom-20 left-3 z-50 w-11 h-11 flex items-center justify-center nav-glass rounded-full"
          style={{ color: 'var(--nav-text-primary)' }}
        >
          <MenuIcon />
        </button>
      )}
```

with:

```tsx
      {/* Mobile: sticky top bar. STICKY, NOT FIXED -- a fixed bar would need
          padding-top on the ~74 pages that render <SiteNav />, which is the
          exact sweep this project reverted twice in August (2a1cb30, 481cdc7
          -> c7ea68b). Sticky rides normal flow, pushes content down by
          itself, and needs no page-level change; the desktop row below does
          the same thing. h-14 (56px) is sized so TopUtilityBar's 44px pill
          centres inside it at top-1.5. */}
      {!desktopOnly && (
        <div
          className="lg:hidden sticky top-0 z-40 h-14 flex items-center px-2 nav-glass"
          style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label={labels[lang].menu}
            className="w-11 h-11 flex items-center justify-center rounded-xl transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-text-primary)' }}
          >
            <ChevronLeftIcon />
          </button>
        </div>
      )}
```

- [ ] **Step 3: Remove the now-unused MenuIcon**

`MenuIcon` (lines 130-136) was only used by the block just deleted. Confirm and remove:

Run: `grep -n "MenuIcon" src/components/SiteNav.tsx`
Expected: exactly one hit — the `function MenuIcon(...)` declaration itself. If any other hit appears, leave the function in place and note it.

Then delete the whole function:

```tsx
function MenuIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Tests and build**

Run: `npm test`
Expected: `Test Files 49 passed (49)`, `Tests 520 passed (520)`.

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add src/components/SiteNav.tsx
git commit -m "feat(nav): mobile sticky top bar with a < drawer trigger, drop the floating hamburger"
```

---

### Task 2: Move the utility pill to the top on mobile

**Files:**
- Modify: `src/components/TopUtilityBar.tsx:594` (the outer container's className)

**Interfaces:**
- Consumes: Task 1's `h-14` top bar and its `z-40`.
- Produces: nothing new — the pill's panels, state and handlers are untouched.

- [ ] **Step 1: Change the mobile position**

In `src/components/TopUtilityBar.tsx`, the outer container currently reads:

```tsx
      <div className="fixed bottom-20 lg:bottom-auto lg:top-[21px] right-3 lg:right-6 z-50 flex items-center gap-1.5 nav-glass rounded-full px-1.5 py-1.5"
        style={{ boxShadow: `0 12px 30px -14px rgba(10,10,15,0.35), var(--nav-card-glow)` }}>
```

Replace that className with (only `bottom-20 lg:bottom-auto` → `top-1.5`; everything else identical):

```tsx
      <div className="fixed top-1.5 lg:top-[21px] right-3 lg:right-6 z-50 flex items-center gap-1.5 nav-glass rounded-full px-1.5 py-1.5"
        style={{ boxShadow: `0 12px 30px -14px rgba(10,10,15,0.35), var(--nav-card-glow)` }}>
```

- [ ] **Step 2: Check the panels still anchor sensibly**

The panels this pill opens are positioned separately (search `isWalletPanel` around line 636). They anchor with `items-end` / `lg:items-start` and `mb-32 lg:mb-14`, which was tuned for a bottom-anchored pill on mobile.

Run: `grep -n "mb-32\|items-end\|bottom-\[" src/components/TopUtilityBar.tsx | head -20`

For each mobile-only bottom anchoring found in the **panel** markup (not the pill), leave it as-is for now and list what you found in the commit message. Mobile panels sliding up from the bottom of the screen is still correct UX with a top-anchored trigger (it is how iOS sheets behave), so this is deliberately not changed. Do NOT rewrite the panel positioning in this task.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Tests and build**

Run: `npm test`
Expected: `Tests 520 passed (520)`.

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/components/TopUtilityBar.tsx
git commit -m "feat(nav): utility pill moves to the top on mobile, aligned into the new sticky bar"
```

---

### Task 3: Delete the bottom tab bar

**Files:**
- Modify: `src/components/SiteNav.tsx:334-389` (delete the whole `{/* Mobile: bottom icon bar ... */}` block)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. All six destinations remain reachable from the drawer.

- [ ] **Step 1: Delete the block**

Remove the entire block starting at the comment `{/* Mobile: bottom icon bar — same fixed position/behavior as the old AppNav bottom bar, restyled */}` through its closing `)}` — in the current file that is lines 334-389, ending immediately before the `{/* Desktop: sticky top bar ... */}` comment.

- [ ] **Step 2: Remove the now-dead `history` label key**

Run: `grep -n "labels\[lang\].history\|mobile-aiAgent\|mobile-kaspiShop\|mobile-wildberries" src/components/SiteNav.tsx`
Expected: no hits — the deleted block was their only consumer.

`labels[lang].history` is now genuinely dead: the drawer's own «История» row comes from `invoicesLinks`' per-link label, not from this key. Remove it from the type and all three language objects at the top of the file (lines 10-14) — four edits:

```tsx
// in the type on line 10, drop `history: string;`
const labels: Record<Lang, { home: string; invoices: string; kaspiShop: string; aiAgent: string; kaspiApi: string; wildberries: string; profile: string; menu: string; close: string }> = {
  ru: { home: 'Дашборд', invoices: 'Счета', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi Cashier API', wildberries: 'WB Bot', profile: 'Профиль', menu: 'Меню', close: 'Закрыть' },
  kk: { home: 'Дашборд', invoices: 'Шоттар', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi Cashier API', wildberries: 'WB Bot', profile: 'Профиль', menu: 'Мәзір', close: 'Жабу' },
  en: { home: 'Dashboard', invoices: 'Invoices', kaspiShop: 'Kaspi Bot', aiAgent: 'AI Agent', kaspiApi: 'Kaspi Cashier API', wildberries: 'WB Bot', profile: 'Profile', menu: 'Menu', close: 'Close' },
}
```

Do NOT remove `LockIcon` — after this deletion it still has two live users (the desktop row and the drawer header).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Tests and build**

Run: `npm test`
Expected: `Tests 520 passed (520)`.

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/components/SiteNav.tsx
git commit -m "feat(nav): drop the mobile bottom tab bar, drawer is now the only mobile navigation"
```

---

### Task 4: Make the drawer's section headers readable

**Files:**
- Modify: `src/components/SiteNav.tsx` — the section header `<button>` inside the drawer's `SECTIONS.map` (currently lines 282-295, shifts up after Tasks 1 and 3)

**Interfaces:**
- Consumes: the `active` boolean already computed one line above (`const active = !locked && activeSection?.key === s.key`), `locked`, `LockIcon`.
- Produces: nothing new.

- [ ] **Step 1: Add a right-chevron icon**

Directly after the `ChevronLeftIcon` added in Task 1, add:

```tsx
function ChevronRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
```

- [ ] **Step 2: Restyle the header button**

Replace the section header button — currently:

```tsx
                        <button
                          type="button"
                          onClick={() => {
                            if (locked) { showLockedHint(`drawer-${s.key}`); return }
                            setDrawerOpen(false)
                            router.push(s.links[0].href)
                          }}
                          aria-disabled={locked}
                          className="w-full min-h-[36px] flex items-center gap-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase text-left"
                          style={{ color: active ? 'var(--nav-text-primary)' : 'var(--nav-text-muted)', cursor: locked ? 'not-allowed' : 'pointer' }}
                        >
                          {labels[lang][s.key]}
                          {locked && <LockIcon size={11} />}
                        </button>
```

with:

```tsx
                        {/* Was an 11px uppercase muted "divider label" back when
                            it was decorative. fe3853f made it navigable but left
                            that styling, so on a phone the drawer read as empty
                            (founder, 2026-09-05) -- a header that does something
                            has to look like the rows above it. */}
                        <button
                          type="button"
                          onClick={() => {
                            if (locked) { showLockedHint(`drawer-${s.key}`); return }
                            setDrawerOpen(false)
                            router.push(s.links[0].href)
                          }}
                          aria-disabled={locked}
                          className="w-full min-h-[44px] flex items-center gap-1.5 px-3 rounded-xl text-sm font-semibold text-left"
                          style={{ color: active ? 'var(--nav-text-primary)' : 'var(--nav-text-secondary)', cursor: locked ? 'not-allowed' : 'pointer' }}
                        >
                          <span className="flex-1 truncate">{labels[lang][s.key]}</span>
                          {locked ? <LockIcon size={13} /> : <ChevronRightIcon />}
                        </button>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Tests and build**

Run: `npm test`
Expected: `Tests 520 passed (520)`.

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/components/SiteNav.tsx
git commit -m "fix(nav): drawer section headers read as menu rows, not muted divider labels"
```

---

### Task 5: Deploy and verify live

**Files:** none — verification only.

**Interfaces:**
- Consumes: Tasks 1-4, all committed.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Find the deployment for these commits**

Use the Vercel MCP `list_deployments` with `projectId: prj_DhkQz2JKsUZ6nNv75uj60FOYsLo6`, `teamId: team_0n5m30JHsf0QUhcrLiq2B4KZ`. Take the newest deployment's `id`.

- [ ] **Step 3: Confirm READY on the real domain**

Use `get_deployment` with that id. Do NOT grep JS bundles for strings to confirm a deploy — that produced a false positive earlier in this project.

Expected, all three together:
- `"readyState": "READY"`
- `"githubCommitSha"` equals the sha of Task 4's commit (`git rev-parse HEAD`)
- `"alias"` contains `"invoices.kz"`

- [ ] **Step 4: Verify the live mobile layout with Playwright**

The prod account for this is `alikhan2505+aitest@gmail.com` (magic-link login; the founder pastes the link — see `temp_admin_test_account_invoices_kz` in memory).

```js
// viewport first, then dashboard
await page.setViewportSize({ width: 390, height: 844 })
await page.goto('https://invoices.kz/dashboard')
```

Assert all five:
1. `page.locator('[role="dialog"][aria-label="Меню"]')` has count 0 before any click (drawer closed).
2. The top bar exists and sits at the top: the «<» button's `boundingBox().y` is under 56.
3. No bottom bar. NOT `count()` on the text — the desktop `<nav>` is `hidden lg:block`, i.e. `display:none` but still in the DOM, so a bare `text=WB Bot` count returns ≥1 on any viewport and would false-positive (caught in Task 3's review). Assert on visibility and on the deleted element's own shape instead:
   ```js
   // the deleted bar was the only `fixed bottom-0` flex row
   await expect(page.locator('div.fixed.bottom-0')).toHaveCount(0)
   await expect(page.getByText('WB Bot')).not.toBeVisible()
   ```
4. Clicking the «<» button opens the drawer, and `drawer.innerText()` contains `Дашборд`, `Профиль`, `Счета`, `Kaspi Cashier API`.
5. Page content is not hidden under the bar: the dashboard's `h1`/first card has `boundingBox().y >= 56`.

- [ ] **Step 5: Hand back to the founder**

Report what was verified and ask him to confirm on his own iPhone, since that is the device the complaint came from. Explicitly ask whether the drawer still reads as "empty" — that is the acceptance test for Task 4.

---

## Follow-up (NOT part of this plan)

After the founder confirms: remove the `pb-24` bottom padding that existed only to clear the deleted tab bar. `grep -rl "pb-24" src/` → 51 files. Separate commit, deliberately, so that a problem with the nav itself is a 2-file revert rather than a 53-file one.
