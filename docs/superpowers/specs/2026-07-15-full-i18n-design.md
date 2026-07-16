# Full application i18n (ru/kk/en)

## Problem

The app currently has a `LanguageProvider` (`src/components/LanguageProvider.tsx`) and a `Lang = 'ru' | 'kk'` type, but only the landing page (`src/app/page.tsx`, via `src/lib/i18n/landing.ts`) actually reads it. Every other page (dashboard, all 13 profile subpages, invoice creation/editing, document viewing, history, admin, onboarding, login) is hardcoded Russian regardless of the selected language. The user wants the whole app translated to Russian/Kazakh/English, with the language switcher living in Settings (it already does — the `/profile` page's "Настройки" section has ru/kk buttons; this adds a third).

Out of scope: `/privacy` and `/terms` (long legal text, explicitly deferred by the user).

## Architecture

Extend the existing pattern rather than introducing a new i18n library (no `next-intl`/`react-i18next` — avoids URL-prefix routing changes that would affect existing invoice links like `/view/[token]`).

- `src/components/LanguageProvider.tsx`: widen `Lang` to `'ru' | 'kk' | 'en'`. No other change needed — `localStorage` persistence and `document.documentElement.lang` already work generically.
- One dictionary file per page/section under `src/lib/i18n/`, each exporting `Record<Lang, T>` for a page-specific content interface — same shape as the existing `landing.ts`. Example naming: `src/lib/i18n/dashboard.ts`, `src/lib/i18n/profileRequisites.ts`, etc. (one file per translated page, named after the page).
- Each page imports `useLanguage()` (already exported from `LanguageProvider`) and does `const t = dict[lang]`, then replaces hardcoded JSX text with `t.someKey`. Keys are named after what the string is (e.g. `t.saveButton`, `t.deleteConfirm`), not by page location.
- `ru` values in every new dictionary must be copied verbatim from the current hardcoded text (zero behavior/wording change for existing Russian users) — translation only adds `kk`/`en` entries.
- Alerts/confirms (`alert(...)`, `confirm(...)`) are in scope — they're user-facing text and must also come from the dictionary.
- Dynamic strings built with template literals (e.g. `` `Счёт №${n} отправлен` ``) become a function value in the dict (e.g. `t.invoiceSentMessage(n)`) rather than a plain string, so interpolation still works per-language.

## Scope (grouped for implementation)

1. **Infrastructure + landing + BottomNav**: widen `Lang` type, add `en` to `landing.ts`, translate `BottomNav.tsx` (3 labels), add the third switcher button on `/profile`.
2. **Auth & onboarding**: `login`, `onboarding`, `auth/callback`.
3. **Dashboard + invoice**: `dashboard`, `invoice/[id]`, `invoice/[id]/edit`.
4. **History + public view**: `history`, `view/[token]` (seen by clients — may be non-Kazakhstani, worth translating well).
5. **Profile hub + core**: `profile` (main), `requisites`, `signature`, `settings`.
6. **Profile — accounts & security**: `banks`, `security`, `connectors`, `notifications`.
7. **Profile — content**: `referral`, `services`, `templates`, `documents`, `about`, `support`.
8. **Misc**: `admin`, `upgrade`, `promo/[code]`, `not-found`.

## Out of scope

- `/privacy`, `/terms` (deferred).
- Any new i18n library or URL-based locale routing.
- Machine-translation quality assurance — translations are done by the implementing agent to a good-faith standard, not reviewed by a native speaker; the user can request corrections after seeing them live.
