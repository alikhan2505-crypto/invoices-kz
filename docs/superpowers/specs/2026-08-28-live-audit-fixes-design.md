# Live audit fixes — landing contrast, zoom, dashboard footer, history scrollbar

## Context

Findings from a live browser audit of production invoices.kz (real screenshots + a real Lighthouse mobile run), reported to the founder, who approved fixing them in whatever order/scope makes sense. Five small, independent, mechanical UI fixes — no new business logic.

## 1. [P1] Landing page text contrast (`src/app/page.tsx`)

Lighthouse's `color-contrast` audit flagged real WCAG AA failures. Grepping the file found this is systemic, not 3 isolated spots: **~25 occurrences** of `color: 'rgba(255,255,255,0.X)'` ranging from 0.25 to 0.64, all under the safe threshold on this page's near-black background (`COLOR.ground`).

Fix: collapse the low end into two safe tiers, preserving the original two rough clusters of intent (very-quiet fine print vs. readable secondary text) instead of flattening all hierarchy to one value:
- Values `0.25`, `0.35`, `0.4` (fine print, footer links, badges) → **`0.68`**
- Values `0.5`, `0.55`, `0.6`, `0.64` (subtitles, descriptions) → **`0.82`**
- Values `0.8`, `0.85`, `0.9` are already comfortably safe on this background — left untouched.

Both new values carry real margin above the 4.5:1 floor on this page's background (verified by contrast-ratio math against the actual near-black ground color, not just nudged past the line), so small gradient/blob backgrounds elsewhere on the page don't reopen the same failure.

## 2. [P1] Gradient text on the hero headline (`src/app/page.tsx`, ~line 743-753)

Found while editing the same file for #1, not in the original 4-item list: the H1's second line uses `WebkitBackgroundClip: 'text'` + a violet→teal gradient background, which is an explicit banned pattern ("Gradient text... Decorative, never meaningful. Use a single solid color."). Fix: replace with a single solid `COLOR.teal` (the brand's existing secondary accent already used elsewhere on this page), no gradient, no background-clip.

## 3. [P1] Mobile zoom disabled site-wide (`src/app/layout.tsx`)

`export const viewport` sets `maximumScale: 1`, which blocks pinch-zoom for every page in the app, not just the landing page — a real WCAG failure for low-vision users, confirmed by Lighthouse. Fix: remove `maximumScale: 1` entirely (default allows normal zoom); keep `width: 'device-width'` and `initialScale: 1`.

## 4. [P1] Missing `<main>` landmark (`src/app/page.tsx`)

Lighthouse: no `<main>` landmark on the page. The page already has a semantic `<header>` and `<footer>`; everything between them (hero through the final CTA section) is the actual main content. Fix: wrap that content in `<main>`, opening right after `</header>` and closing right before `<footer>`.

## 5. [P2] Dashboard footer links hidden behind the wallet pill on mobile (`src/app/dashboard/page.tsx`)

Verified by exact coordinates (not visual guess): on a 390×976 mobile viewport, the footer's WhatsApp/Email/Telegram links sit at y=849-865, and the fixed wallet/notification pill occupies y=838-896 at the same x-range — the links render underneath it, untappable.

Root cause: the footer (`<footer className="mt-8 pt-5">` containing three `flex flex-wrap` groups — company info, legal links, contact links) wraps unpredictably on narrow viewports, and the page's existing `pb-24` (96px) bottom padding doesn't reliably clear the fixed pill's zone (which extends up to 138px above the viewport bottom) once the footer wraps to 3+ rows.

Fix, two parts:
- Footer layout: `flex flex-wrap items-center justify-between` → stack the three groups vertically on mobile (`flex flex-col gap-3`), switching to the current horizontal layout only at `sm:` and up (`sm:flex-row sm:items-center sm:justify-between`). This makes the footer's mobile height predictable instead of wrap-order-dependent.
- Bottom clearance: `pb-24 lg:pb-6` → `pb-32 lg:pb-6` on the page's `<main>` wrapper, so the now-predictable stacked footer has real clearance above the pill's zone regardless of exact row count.

## 6. [P3] Native horizontal scrollbar visible on `/history` filter rows (`src/app/history/page.tsx`, `src/app/globals.css`)

Both the date-filter and status-filter tab rows use `overflow-x-auto`, which shows the browser's default scrollbar bar on top of the tab pills on mobile — reads as unpolished. `globals.css` already has a precedent for exactly this (`.desktop-shell-scroll`, hides the bar via `::-webkit-scrollbar { display: none }` + `scrollbar-width: none`, scrolling still works). Fix: add a new, more generically-named utility `.hide-scrollbar` following the same technique, and apply it (alongside the existing `overflow-x-auto`) to both filter rows in `history/page.tsx`.

## Testing

All six are pure CSS/markup changes on existing elements — no new logic, no new tests, consistent with how this codebase has treated identical-in-kind changes before (the tap-zone sweep, the merchantId tooltip task). Verification: `tsc --noEmit`, then a live check — re-run the same Lighthouse mobile audit on the landing page to confirm the contrast/zoom/landmark failures are gone, and a manual mobile screenshot of `/dashboard` scrolled to the bottom and `/history` to confirm the footer and scrollbar fixes.
