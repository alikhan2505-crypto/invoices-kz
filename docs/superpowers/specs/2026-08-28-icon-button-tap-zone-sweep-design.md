# Icon action-button tap-zone sweep

## Goal

The 2026-08-23 batch rewrote DESIGN.md's "Icon Action Buttons" rule from "min 32×32px" to "visual size can stay 32px, but tap zone must be ≥44×44px" and applied it to the invoice history page's repeat/delete buttons (commit `366074b`). This finishes the sweep: every other real icon-only action button in the codebase still on the old `w-8 h-8` (32px) tap zone.

## Scope (verified against current code, not the "~17 files" estimate in memory)

A grep for `w-8 h-8` across `src/` matched 17 files, but only **7 files / 14 buttons** are actually clickable `<button onClick=...>` action buttons — the rest are decorative, non-interactive icon badges (avatar circles, section-icon badges, the loading spinner, onboarding step-number circles, the "primary account" star indicator) that were never tap targets and must NOT be touched — enlarging them would visually break their rows for no accessibility benefit.

Files/buttons in scope:
- `src/components/TopUtilityBar.tsx` — notifications, help, account (3 buttons)
- `src/app/profile/templates/page.tsx` — delete template (1)
- `src/app/profile/services/page.tsx` — edit, delete service (2)
- `src/app/profile/clients/page.tsx` — edit, delete client (2)
- `src/app/profile/banks/page.tsx` — set-main, edit, delete account (3)
- `src/app/profile/documents/page.tsx` — open накладная, delete document (2)
- `src/app/profile/contracts/page.tsx` — delete contract (1)

## Approach

Mechanical, identical to the already-shipped history-page precedent: change each button's className from `w-8 h-8` to `w-11 h-11` (32px → 44px). Nothing else about the button changes — its shape (`rounded-full` vs `rounded-lg`), colors, hover states, and the icon's own size inside it stay exactly as they are today. This is a pure tap-zone expansion via invisible padding, not a visual redesign.

## Known risk, not pre-solved

`profile/banks/page.tsx` has a 3-element row (set-main button, a decorative star badge, edit button, delete button — 4 elements when `is_main`) tighter than the 2-button row the original history-page fix handled. Growing 3 adjacent buttons from 32px to 44px each may visually crowd that row more than the precedent case. Per this codebase's established practice (ship the mechanical change, verify against the real live render rather than guessing every row's spacing in advance), this is not being redesigned preemptively — it will be checked after deploy, and `gap-1`/spacing only adjusted if the real render actually looks crowded.

## Testing

Pure CSS class changes on existing interactive elements — no new logic, no new branches. `tsc --noEmit` confirms nothing broke syntactically; verification is visual, on the live deploy (same as the history-page precedent, which also had no new automated test).
