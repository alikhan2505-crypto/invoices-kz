# Acquiring (Эквайринг) — Manual Statement Import v1 — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let Pro-plan users upload their Kaspi Pay account statement (Excel export) and automatically find candidate invoice payments by matching payer BIN + amount against their own open invoices, with one-click confirmation to mark matched invoices as paid.

**Why this shape, not an API integration:** Extensive research this session (documented in memory) established that no bank or Kaspi Pay wrapper (xpayment.kz, apipay.kz) exposes a statement-with-BIN API without a formal partnership agreement with the bank — a business/legal process outside engineering's control, with no fixed timeline. The user explicitly wants something shippable today. Manual statement import requires no third-party registration, no waiting, and no new secrets: it works entirely from data the account owner already has (their own downloaded statement) and their own invoices already in our database.

## Global Constraints

- **Pro plan only.** New `canAcquiring: boolean` on `PlanInfo` (`src/lib/plan.ts`), following the exact same pattern as the existing `canEcp` flag: `true` only for an active, non-expired `profile.plan === 'pro'`. Trial, bonus days, and Basic must NOT grant it, matching the precedent set for ЭЦП gating this same session.
- **The raw statement file is never uploaded to our server or stored anywhere.** Parse it entirely client-side in the browser. Only the outcome of a user-confirmed match (an invoice ID + "mark as paid") ever reaches our backend — via the exact same `invoices` update + `invoice_logs` insert pattern already used everywhere else in the app (see `src/app/invoice/[id]/page.tsx`'s `updateStatus`). This is a deliberate privacy/security choice: a real bank statement contains the owner's entire transaction history, including unrelated counterparties — there is no reason for that data to ever leave the user's device.
- **No new backend table, no new RLS policy, no new secret.** The feature reads data the client can already see (its own invoices, via existing RLS) and writes through an existing, already-audited code path (invoice status update). Keeping it this way is what keeps the security surface at zero net-new attack surface for this feature.
- **Match only on exact BIN + exact amount.** No fuzzy/partial matching in v1 — a false-positive "paid" mark is worse than a missed match the user can handle manually. Every match is shown to the user for one-click confirmation; nothing is marked paid automatically without that click.
- **File validation before parsing:** reject anything that isn't `.xlsx`/`.xls` by extension+mimetype, and cap file size (5 MB) before handing it to the parser, to avoid a hostile/corrupt file hanging the browser tab.
- **No assumed column layout beyond a best-effort guess.** We do not have a real sample of Kaspi Pay's exported statement. The parser must locate columns by matching header text (case-insensitive, Russian labels like "БИН"/"ИИН", "Сумма", "Дата", "Контрагент"/"Назначение") rather than hard-coded column indices, and must fail with a clear, human-readable error (not a silent wrong-column misread) if it cannot confidently locate the required columns. This is a known, disclosed limitation of v1 — flagged to the user, not hidden.

**Known accepted risk (v1):** the `xlsx` npm package is pinned at 0.18.5, which has published CVEs (prototype pollution CVE-2023-30533, ReDoS CVE-2024-22363) fixed only in newer SheetJS-hosted builds not published to the npm registry. Since this feature only parses files the account owner deliberately uploads (their own bank statement) in their own browser session, the blast radius of a malicious file is limited to that user's own session — but this is a real, disclosed gap, not a non-issue. Upgrading to a SheetJS CDN-hosted build is a reasonable v2 follow-up, deliberately deferred here to avoid changing the dependency install source without separate testing.

## Architecture

```
User (Pro plan)
  → /profile/acquiring page
  → picks .xlsx file (never leaves the browser)
  → client-side: parse with `xlsx` package → rows: { date, amount, bin, description }
  → client-side: fetch own open invoices (existing supabase client, RLS-scoped)
  → client-side: pure matching function (amount, statement rows, invoices) → matches[]
  → UI lists matches, one "Подтвердить оплату" button each
  → on click: existing invoice-status-update code path (status='paid' + invoice_logs insert)
```

No new API route. No new database table. No new environment variable.

## Components

### 1. `src/lib/plan.ts` (modify)
Add `canAcquiring: boolean` to `PlanInfo`, populated identically to `canEcp` in every branch (paid/bonus/trial/free).

### 2. `src/lib/acquiringMatch.ts` (new)
Pure, unit-testable matching logic — no I/O, no React, no Supabase import. This isolation is what makes it testable without mocking a browser or a database.

```ts
export interface StatementRow {
  date: string        // as parsed from the sheet, display-only
  amount: number
  bin: string          // digits only, normalized (see normalizeBin)
  description: string
}

export interface OpenInvoice {
  id: string
  number: string
  client_name: string | null
  client_bin: string | null
  amount: number
}

export interface AcquiringMatch {
  invoice: OpenInvoice
  row: StatementRow
}

export function normalizeBin(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function findMatches(rows: StatementRow[], invoices: OpenInvoice[]): AcquiringMatch[] {
  const matches: AcquiringMatch[] = []
  for (const row of rows) {
    for (const invoice of invoices) {
      if (!invoice.client_bin) continue
      if (normalizeBin(invoice.client_bin) !== row.bin) continue
      if (Number(invoice.amount) !== Number(row.amount)) continue
      matches.push({ invoice, row })
    }
  }
  return matches
}
```

### 3. `src/lib/acquiringParse.ts` (new)
Excel parsing, isolated from matching so the matching logic stays pure/testable. Uses the `xlsx` package (new dependency — add to `package.json`).

- `parseStatementFile(file: File): Promise<StatementRow[]>`
- Validates extension (`.xlsx`/`.xls`) and size (≤ 5 MB) before parsing; throws a user-facing error message (via the page's existing i18n dict) otherwise.
- Locates the header row by scanning the first ~10 rows for cells matching (case-insensitive, trimmed) any of a small set of known header aliases per field (e.g., БИН column: "бин", "иин", "бин/иин"; amount column: "сумма", "сумма операции"; date column: "дата"; description: "назначение", "контрагент", "описание").
- If any required column (BIN, amount) can't be located, throws a clear error surfaced in the UI (e.g., "Не удалось распознать структуру файла — попробуйте другой формат экспорта").

### 4. `src/app/profile/acquiring/page.tsx` (new)
- Loads `profile` (for `getActivePlan`) and, if `canAcquiring`, the user's open invoices (`status not in ('paid','cancelled')`, `client_bin is not null`).
- If not Pro: locked card + upgrade CTA, same visual pattern as the ЭЦП lock added to `/invoice/[id]` and `/contract/[id]` this session (🔒 badge, explanation, button to `/upgrade`).
- File input (accept `.xlsx,.xls`) → on change: `parseStatementFile` → `findMatches` → render results.
- Each match: invoice number, client name, amount, matched statement row's date/description, "Подтвердить оплату" button → calls the same `updateStatus('paid')`-equivalent (insert into `invoice_logs`, update `invoices.status`) already used in `invoice/[id]/page.tsx`, then removes that match from the visible list.
- Unmatched-row count shown as a plain summary line ("N операций не совпало ни с одним счётом") — never lists the unmatched rows' contents, since those are unrelated transactions with no bearing on invoices.kz.

### 5. `src/lib/i18n/acquiring.ts` (new)
New dict (ru/kk/en) following the existing per-page dict convention (see `contracts.ts` from this session for the exact shape/pattern to copy).

### 6. Nav entry
Add "Эквайринг" to the Profile page's company/settings section (`src/app/profile/page.tsx`), same list style as Requisites/Signature/Banks/Security, pointing at `/profile/acquiring`.

## Testing

- `src/lib/acquiringMatch.test.ts` (Vitest, matching the existing 2-test-file convention): exact match, no match (BIN differs), no match (amount differs), BIN normalization (spaces/formatting), multiple invoices for the same BIN where only one amount matches.
- No test for the Excel parser itself (no real sample file to build fixtures from yet — this is the disclosed v1 limitation). Manual verification with a real exported statement is the acceptance step for this task, called out explicitly in its own plan task.

## Out of scope for v1 (explicitly, not silently dropped)

- Any live bank/Kaspi API integration (blocked on partnership, see Global Constraints).
- Auto-marking invoices paid without a confirmation click.
- Persisting the uploaded statement or its rows anywhere server-side.
- Fuzzy/partial BIN or amount matching.
- Non-Excel statement formats (PDF, 1C exchange XML).
