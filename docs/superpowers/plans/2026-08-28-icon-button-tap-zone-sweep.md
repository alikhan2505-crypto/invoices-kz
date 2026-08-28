# Icon Action-Button Tap-Zone Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the tap zone of every remaining real icon-only action button from 32×32px (`w-8 h-8`) to 44×44px (`w-11 h-11`), matching the rule already shipped for the invoice history page (commit `366074b`) and documented in DESIGN.md.

**Architecture:** Pure CSS class swap on 14 existing `<button>` elements across 7 files — no logic, layout structure, shape, color, or icon-size changes. Decorative non-button icon badges elsewhere in the codebase (avatars, section icons, the spinner, onboarding step circles) are explicitly out of scope and must not be touched.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS.

## Global Constraints

- Only the `w-8 h-8` → `w-11 h-11` class on each button changes — shape classes (`rounded-full`/`rounded-lg`), colors, hover states, and the icon rendered inside each button stay exactly as they are.
- Do not touch any non-`<button>` element, even if it also has `w-8 h-8` (decorative badges/spinner/step-circles are out of scope).
- No new automated tests — pure CSS class change on existing interactive elements, matching the history-page precedent's own testing approach (per the spec).
- `profile/banks/page.tsx`'s row of 3-4 elements is a known visual-crowding risk (per spec) — ship the change, verify the real render, only adjust spacing (`gap-1`) if it actually looks crowded live. Do not pre-emptively change spacing in this task.

---

### Task 1: Grow all 14 button tap zones to 44×44px

**Files:**
- Modify: `src/components/TopUtilityBar.tsx` (3 buttons: notifications, help, account)
- Modify: `src/app/profile/templates/page.tsx` (1 button: delete template)
- Modify: `src/app/profile/services/page.tsx` (2 buttons: edit, delete service)
- Modify: `src/app/profile/clients/page.tsx` (2 buttons: edit, delete client)
- Modify: `src/app/profile/banks/page.tsx` (3 buttons: set-main, edit, delete account)
- Modify: `src/app/profile/documents/page.tsx` (2 buttons: open накладная, delete document)
- Modify: `src/app/profile/contracts/page.tsx` (1 button: delete contract)

**Interfaces:** None — this task has no consumers/producers relationship with any other code. Every change is a self-contained `className` edit.

- [ ] **Step 1: `TopUtilityBar.tsx` — notifications button**

Find:
```tsx
        <button onClick={() => openPanel('notifications')} title="Уведомления"
          className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors">
```

Replace with:
```tsx
        <button onClick={() => openPanel('notifications')} title="Уведомления"
          className="relative w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors">
```

- [ ] **Step 2: `TopUtilityBar.tsx` — help button**

Find:
```tsx
        <button onClick={() => openPanel('help')} title="Помощь"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors">
```

Replace with:
```tsx
        <button onClick={() => openPanel('help')} title="Помощь"
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors">
```

- [ ] **Step 3: `TopUtilityBar.tsx` — account button**

Find:
```tsx
        <button onClick={() => openPanel('account')} title="Аккаунт"
          className="w-8 h-8 rounded-full bg-[var(--nav-accent)] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
```

Replace with:
```tsx
        <button onClick={() => openPanel('account')} title="Аккаунт"
          className="w-11 h-11 rounded-full bg-[var(--nav-accent)] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
```

- [ ] **Step 4: `profile/templates/page.tsx` — delete template button**

Find:
```tsx
                    <button
                      onClick={() => deleteTemplate(tpl.id)}
                      aria-label={deleteLabel(lang)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
                    <button
                      onClick={() => deleteTemplate(tpl.id)}
                      aria-label={deleteLabel(lang)}
                      className="w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 5: `profile/services/page.tsx` — edit service button**

Find:
```tsx
          <button onClick={() => startEdit(svc)} aria-label={editLabel(lang)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
          <button onClick={() => startEdit(svc)} aria-label={editLabel(lang)}
            className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 6: `profile/services/page.tsx` — delete service button**

Find:
```tsx
          <button onClick={() => deleteService(svc.id)} aria-label={deleteLabel(lang)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
            style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
          <button onClick={() => deleteService(svc.id)} aria-label={deleteLabel(lang)}
            className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
            style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 7: `profile/clients/page.tsx` — edit client button**

Find:
```tsx
                    <button onClick={() => startEdit(client)} aria-label="Изменить"
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
                    <button onClick={() => startEdit(client)} aria-label="Изменить"
                      className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 8: `profile/clients/page.tsx` — delete client button**

Find:
```tsx
                    <button onClick={() => deleteClient(client.id)} aria-label="Удалить"
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
                    <button onClick={() => deleteClient(client.id)} aria-label="Удалить"
                      className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 9: `profile/banks/page.tsx` — set-main button**

Find:
```tsx
                        <button onClick={() => setMain(acc.id)} title={t.setMainTitle}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
                          style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
                        <button onClick={() => setMain(acc.id)} title={t.setMainTitle}
                          className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
                          style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 10: `profile/banks/page.tsx` — edit account button**

Find:
```tsx
                      <button onClick={() => startEdit(acc)} title={t.editTitle} aria-label={editLabel(lang)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
                        style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
                      <button onClick={() => startEdit(acc)} title={t.editTitle} aria-label={editLabel(lang)}
                        className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
                        style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 11: `profile/banks/page.tsx` — delete account button**

Find:
```tsx
                      <button onClick={() => deleteAccount(acc.id)} title={t.deleteTitle} aria-label={deleteLabel(lang)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                        style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
                      <button onClick={() => deleteAccount(acc.id)} title={t.deleteTitle} aria-label={deleteLabel(lang)}
                        className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                        style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 12: `profile/documents/page.tsx` — open накладная button**

Find:
```tsx
                          disabled={busyDocId === doc.id}
                          aria-label={t.openNakladnayaAriaLabel}
                          title={t.openTitleLabel}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] disabled:opacity-40"
                          style={{ color: 'var(--nav-accent)' }}>
```

Replace with:
```tsx
                          disabled={busyDocId === doc.id}
                          aria-label={t.openNakladnayaAriaLabel}
                          title={t.openTitleLabel}
                          className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] disabled:opacity-40"
                          style={{ color: 'var(--nav-accent)' }}>
```

- [ ] **Step 13: `profile/documents/page.tsx` — delete document button**

Find:
```tsx
                        disabled={busyDocId === doc.id}
                        aria-label={deleteLabel(lang)}
                        title={t.deleteTitleLabel}
                        className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)] disabled:opacity-40"
                        style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
                        disabled={busyDocId === doc.id}
                        aria-label={deleteLabel(lang)}
                        title={t.deleteTitleLabel}
                        className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)] disabled:opacity-40"
                        style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 14: `profile/contracts/page.tsx` — delete contract button**

Find:
```tsx
                      onClick={e => { e.stopPropagation(); deleteContract(c.id) }}
                      aria-label={deleteLabel(lang)}
                      title={t.deleteButton}
                      className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ml-2 transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
```

Replace with:
```tsx
                      onClick={e => { e.stopPropagation(); deleteContract(c.id) }}
                      aria-label={deleteLabel(lang)}
                      title={t.deleteButton}
                      className="w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0 ml-2 transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
```

- [ ] **Step 15: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean pass).

- [ ] **Step 16: Commit**

```bash
git add src/components/TopUtilityBar.tsx src/app/profile/templates/page.tsx src/app/profile/services/page.tsx src/app/profile/clients/page.tsx src/app/profile/banks/page.tsx src/app/profile/documents/page.tsx src/app/profile/contracts/page.tsx
git commit -m "fix: expand remaining icon action-button tap zones to 44x44 (PRODUCT.md baseline)"
```

- [ ] **Step 17: Push and deploy**

```bash
git pull --rebase --autostash origin main
git push origin main
```

- [ ] **Step 18: Manual visual verification on production**

Once the Vercel deploy for this commit is READY, check each touched page as an admin: the top-right utility bar (notifications/help/account buttons), `/profile/templates`, `/profile/services`, `/profile/clients`, `/profile/banks`, `/profile/documents`, `/profile/contracts`. Confirm buttons look visually the same (icon size unchanged) but click comfortably. Pay particular attention to `/profile/banks` — a bank account row can show 3-4 elements (set-main button, star badge, edit, delete) side by side; if the row now looks visually crowded or elements overlap, that's the known risk flagged in the design spec and needs a follow-up spacing fix (not part of this task).

---

## Self-Review

**Spec coverage:** All 7 files / 14 buttons listed in the spec's Scope section have a corresponding step (Steps 1-14). The spec's "known risk, not pre-solved" note about `profile/banks/page.tsx` is carried into Step 18's verification instructions rather than acted on preemptively, matching the spec's explicit intent. The spec's Testing section (tsc + manual visual check, no new automated tests) maps to Steps 15 and 18.

**Placeholder scan:** No TBD/TODO; every step shows exact before/after code or an exact command with expected output.

**Type consistency:** N/A — this task changes only string literals inside `className` attributes, no types/signatures introduced or consumed across steps.
