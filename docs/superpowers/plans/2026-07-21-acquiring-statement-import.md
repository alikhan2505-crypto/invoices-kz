# Acquiring (Эквайринг) Manual Statement Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pro-only "Эквайринг" section where a user uploads their Kaspi Pay statement (Excel export), the app matches rows to their own open invoices by BIN + amount entirely client-side, and one click marks a matched invoice paid.

**Architecture:** Two new pure, dependency-free lib modules (`acquiringParse.ts`, `acquiringMatch.ts`) that do all the real work and are unit-tested in isolation; a new Pro-gated page wires them together using data already reachable via existing RLS-scoped Supabase queries and the existing invoice-status-update pattern. No new backend table, API route, or secret.

**Tech Stack:** Next.js App Router client component, `xlsx` (already a project dependency — confirm in Task 3, do not re-add), Supabase JS client (existing RLS), Vitest.

## Global Constraints

- Pro plan only — new `canAcquiring` flag, `true` only for an active non-expired `profile.plan === 'pro'` (same rule as the existing `canEcp` flag). Trial/bonus/Basic → `false`.
- The uploaded statement file and its parsed rows never leave the browser and are never sent to our backend. Only a confirmed match's invoice ID reaches Supabase, through the exact update pattern already used in `src/app/invoice/[id]/page.tsx`'s `updateStatus`: `supabase.from('invoices').update({ status: 'paid' }).eq('id', id)` followed by `supabase.from('invoice_logs').insert({ invoice_id: id, status: 'paid' })`.
- No new database table, RLS policy, API route, or environment variable for this feature.
- Match only on **exact** BIN + **exact** amount. No fuzzy matching. Every match requires an explicit user click — nothing is marked paid automatically.
- Reject non-`.xlsx`/`.xls` files and anything over 5 MB before parsing.
- The Excel column-detection is header-text matching (case-insensitive Russian labels), not fixed column indices — and must throw a clear, catchable error if it can't find the BIN or amount column, rather than silently misreading data.
- Full spec: `docs/superpowers/specs/2026-07-21-acquiring-statement-import-design.md` — read it if anything below is ambiguous.

---

### Task 1: Add `canAcquiring` plan flag

**Files:**
- Modify: `src/lib/plan.ts`
- Modify: `src/lib/plan.test.ts`

**Interfaces:**
- Produces: `PlanInfo.canAcquiring: boolean`, importable via `import { getActivePlan } from '@/lib/plan'` — later tasks (the acquiring page) read `getActivePlan(profile).canAcquiring`.

- [ ] **Step 1: Write the failing test**

Add this test to the end of the `describe('getActivePlan', ...)` block in `src/lib/plan.test.ts` (insert just before the final closing `})`):

```ts
  it('grants canAcquiring only to an active Pro plan, not Basic/trial/bonus', () => {
    expect(getActivePlan({ plan: 'pro' }).canAcquiring).toBe(true)
    expect(getActivePlan({ plan: 'basic' }).canAcquiring).toBe(false)
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    expect(getActivePlan({ bonus_expires_at: future }).canAcquiring).toBe(false)
    expect(getActivePlan({ trial_expires_at: future }).canAcquiring).toBe(false)
    expect(getActivePlan(null).canAcquiring).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/plan.test.ts`
Expected: FAIL — `canAcquiring` is `undefined`, not `true`/`false`, on the first assertion.

- [ ] **Step 3: Add the flag**

In `src/lib/plan.ts`:

1. Add `canAcquiring: boolean` to the `PlanInfo` interface, right after `canEcp: boolean`.
2. In every object literal that currently sets `canEcp`, add `canAcquiring` immediately after it with the same value expression as `canEcp` uses in that branch (`profile.plan === 'pro'` in the two paid-plan branches, `false` in the free/bonus/trial/missing-profile branches). There are 5 such literals in the file (missing-profile, paid-no-expiry, paid-with-expiry, bonus, trial, free — 6 total, all of which currently set `canEcp`). Concretely, every occurrence of `canEcp: profile.plan === 'pro',` becomes:

```ts
        canEcp: profile.plan === 'pro',
        canAcquiring: profile.plan === 'pro',
```

and every occurrence of `canEcp: false,` (there are 4: missing-profile, bonus, trial, final free) becomes:

```ts
canEcp: false, canAcquiring: false,
```

(matching the existing single-line style used in those 4 branches).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/plan.test.ts`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan.ts src/lib/plan.test.ts
git commit -m "add canAcquiring plan flag, gated to Pro only like canEcp"
```

---

### Task 2: Pure matching logic (`acquiringMatch.ts`)

**Files:**
- Create: `src/lib/acquiringMatch.ts`
- Test: `src/lib/acquiringMatch.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no imports from the rest of the app).
- Produces: `StatementRow`, `OpenInvoice`, `AcquiringMatch` types, `normalizeBin(raw: string): string`, `findMatches(rows: StatementRow[], invoices: OpenInvoice[]): AcquiringMatch[]` — all imported by Task 3's parser (for the `StatementRow` type) and Task 6's page (for everything).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/acquiringMatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeBin, findMatches, OpenInvoice, StatementRow } from './acquiringMatch'

function row(overrides: Partial<StatementRow> = {}): StatementRow {
  return { date: '2026-07-01', amount: 100000, bin: '123456789012', description: 'Оплата', ...overrides }
}

function invoice(overrides: Partial<OpenInvoice> = {}): OpenInvoice {
  return { id: 'inv-1', number: 'INV-0001', client_name: 'ТОО Ромашка', client_bin: '123456789012', amount: 100000, ...overrides }
}

describe('normalizeBin', () => {
  it('strips non-digit characters', () => {
    expect(normalizeBin('123 456 789 012')).toBe('123456789012')
    expect(normalizeBin('БИН: 123456789012')).toBe('123456789012')
  })
})

describe('findMatches', () => {
  it('matches when BIN and amount both match exactly', () => {
    const matches = findMatches([row()], [invoice()])
    expect(matches).toHaveLength(1)
    expect(matches[0].invoice.id).toBe('inv-1')
  })

  it('does not match when BIN differs', () => {
    const matches = findMatches([row({ bin: '999999999999' })], [invoice()])
    expect(matches).toHaveLength(0)
  })

  it('does not match when amount differs', () => {
    const matches = findMatches([row({ amount: 50000 })], [invoice()])
    expect(matches).toHaveLength(0)
  })

  it('skips invoices with no client_bin', () => {
    const matches = findMatches([row()], [invoice({ client_bin: null })])
    expect(matches).toHaveLength(0)
  })

  it('picks only the invoice whose amount matches, among several with the same BIN', () => {
    const invoices = [
      invoice({ id: 'inv-2', number: 'INV-0002', amount: 50000 }),
      invoice({ id: 'inv-3', number: 'INV-0003', amount: 100000 }),
    ]
    const matches = findMatches([row({ amount: 100000 })], invoices)
    expect(matches).toHaveLength(1)
    expect(matches[0].invoice.id).toBe('inv-3')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/acquiringMatch.test.ts`
Expected: FAIL with "Cannot find module './acquiringMatch'" (file doesn't exist yet).

- [ ] **Step 3: Implement**

Create `src/lib/acquiringMatch.ts`:

```ts
export interface StatementRow {
  date: string
  amount: number
  bin: string
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/acquiringMatch.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/acquiringMatch.ts src/lib/acquiringMatch.test.ts
git commit -m "add pure BIN+amount statement/invoice matching logic"
```

---

### Task 3: Excel statement parser (`acquiringParse.ts`)

**Files:**
- Create: `src/lib/acquiringParse.ts`

**Interfaces:**
- Consumes: `StatementRow` type from `./acquiringMatch` (Task 2).
- Produces: `parseStatementFile(file: File): Promise<StatementRow[]>`, `AcquiringParseError` class — consumed by Task 6's page.

- [ ] **Step 1: Confirm `xlsx` is already a dependency**

Run: `node -e "console.log(require('xlsx/package.json').version)"`
Expected: prints a version number (e.g. `0.18.5`) — `xlsx` is already in `package.json`'s `dependencies`, do NOT run `npm install xlsx` again.

- [ ] **Step 2: Implement the parser**

Create `src/lib/acquiringParse.ts`:

```ts
import * as XLSX from 'xlsx'
import { StatementRow } from './acquiringMatch'

export class AcquiringParseError extends Error {}

const MAX_FILE_BYTES = 5 * 1024 * 1024

const BIN_HEADER_ALIASES = ['бин', 'иин', 'бин/иин', 'иин/бин']
const AMOUNT_HEADER_ALIASES = ['сумма', 'сумма операции', 'сумма платежа']
const DATE_HEADER_ALIASES = ['дата', 'дата операции', 'дата платежа']
const DESCRIPTION_HEADER_ALIASES = ['назначение', 'назначение платежа', 'контрагент', 'описание']

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '').trim().toLowerCase()
}

function findColumn(headerRow: unknown[], aliases: string[]): number {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = normalizeHeader(headerRow[i])
    if (aliases.some(alias => cell === alias || cell.includes(alias))) return i
  }
  return -1
}

export async function parseStatementFile(file: File): Promise<StatementRow[]> {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name)
  if (!isExcel) {
    throw new AcquiringParseError('Поддерживаются только файлы .xlsx или .xls')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new AcquiringParseError('Файл слишком большой (максимум 5 МБ)')
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new AcquiringParseError('В файле нет ни одного листа')
  }
  const sheet = workbook.Sheets[firstSheetName]
  const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  let headerRowIndex = -1
  let binCol = -1
  let amountCol = -1
  let dateCol = -1
  let descriptionCol = -1

  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const candidateBinCol = findColumn(grid[i], BIN_HEADER_ALIASES)
    const candidateAmountCol = findColumn(grid[i], AMOUNT_HEADER_ALIASES)
    if (candidateBinCol !== -1 && candidateAmountCol !== -1) {
      headerRowIndex = i
      binCol = candidateBinCol
      amountCol = candidateAmountCol
      dateCol = findColumn(grid[i], DATE_HEADER_ALIASES)
      descriptionCol = findColumn(grid[i], DESCRIPTION_HEADER_ALIASES)
      break
    }
  }

  if (headerRowIndex === -1) {
    throw new AcquiringParseError('Не удалось распознать структуру файла — попробуйте другой формат экспорта')
  }

  const rows: StatementRow[] = []
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const line = grid[i]
    if (!line || line.length === 0) continue
    const binRaw = String(line[binCol] ?? '').trim()
    const amountRaw = line[amountCol]
    if (!binRaw || amountRaw === '' || amountRaw === undefined) continue
    const amount = Number(String(amountRaw).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(amount)) continue
    rows.push({
      bin: binRaw.replace(/\D/g, ''),
      amount,
      date: dateCol !== -1 ? String(line[dateCol] ?? '') : '',
      description: descriptionCol !== -1 ? String(line[descriptionCol] ?? '') : '',
    })
  }

  return rows
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors related to `acquiringParse.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/acquiringParse.ts
git commit -m "add Excel statement parser with header-text column detection"
```

(No automated test here — no real sample Kaspi statement export exists yet to build a fixture from. This is the plan's disclosed v1 limitation; Task 7 calls out manual verification with a real file as an explicit acceptance step.)

---

### Task 4: i18n dict for the Acquiring page

**Files:**
- Create: `src/lib/i18n/acquiring.ts`

**Interfaces:**
- Produces: `acquiringDict: Record<'ru' | 'kk' | 'en', AcquiringContent>` — consumed by Task 6's page via `import { acquiringDict } from '@/lib/i18n/acquiring'`.

- [ ] **Step 1: Create the dict**

Create `src/lib/i18n/acquiring.ts`:

```ts
export interface AcquiringContent {
  headerLabel: string
  introText: string
  proBadge: string
  proLockedHint: string
  goToPlansButton: string
  loadingLabel: string
  chooseFileButton: string
  fileChosenLabel: (name: string) => string
  processingLabel: string
  noOpenInvoicesHint: string
  matchesFoundLabel: (count: number) => string
  noMatchesFoundHint: string
  unmatchedRowsLabel: (count: number) => string
  invoiceLabel: (number: string) => string
  clientLabel: string
  amountLabel: string
  statementDateLabel: string
  descriptionLabel: string
  confirmPaymentButton: string
  confirmingLabel: string
  errorPrefix: (message: string) => string
}

export const acquiringDict: Record<'ru' | 'kk' | 'en', AcquiringContent> = {
  ru: {
    headerLabel: 'Эквайринг',
    introText: 'Загрузите выписку по счёту (Excel-экспорт из приложения Kaspi Pay) — мы сопоставим операции с вашими открытыми счетами по БИН плательщика и сумме. Файл обрабатывается только в браузере и никуда не отправляется.',
    proBadge: 'Про',
    proLockedHint: 'Доступно на тарифе Про',
    goToPlansButton: 'Перейти к тарифам',
    loadingLabel: 'Загрузка...',
    chooseFileButton: 'Выбрать файл выписки (.xlsx)',
    fileChosenLabel: (name: string) => `Файл: ${name}`,
    processingLabel: 'Обрабатываем файл...',
    noOpenInvoicesHint: 'Нет открытых счетов с указанным БИН клиента для сопоставления.',
    matchesFoundLabel: (count: number) => `Найдено совпадений: ${count}`,
    noMatchesFoundHint: 'Совпадений не найдено — ни одна операция не подошла по БИН и сумме к открытым счетам.',
    unmatchedRowsLabel: (count: number) => `Операций без совпадения: ${count}`,
    invoiceLabel: (number: string) => `Счёт №${number}`,
    clientLabel: 'Клиент',
    amountLabel: 'Сумма',
    statementDateLabel: 'Дата операции',
    descriptionLabel: 'Назначение',
    confirmPaymentButton: 'Подтвердить оплату',
    confirmingLabel: 'Подтверждаем...',
    errorPrefix: (message: string) => `Ошибка: ${message}`,
  },
  kk: {
    headerLabel: 'Эквайринг',
    introText: 'Шот бойынша үзінді көшірмені (Kaspi Pay қосымшасынан Excel-экспорт) жүктеңіз — біз операцияларды сіздің ашық шоттарыңызбен төлеуші БИН-і мен сомасы бойынша салыстырамыз. Файл тек браузерде өңделеді және ешқайда жіберілмейді.',
    proBadge: 'Про',
    proLockedHint: 'Про тарифінде қолжетімді',
    goToPlansButton: 'Тарифтерге өту',
    loadingLabel: 'Жүктелуде...',
    chooseFileButton: 'Үзінді көшірме файлын таңдау (.xlsx)',
    fileChosenLabel: (name: string) => `Файл: ${name}`,
    processingLabel: 'Файл өңделуде...',
    noOpenInvoicesHint: 'Салыстыру үшін клиенттің БИН-і көрсетілген ашық шоттар жоқ.',
    matchesFoundLabel: (count: number) => `Табылған сәйкестіктер: ${count}`,
    noMatchesFoundHint: 'Сәйкестік табылмады — БИН мен сома бойынша ашық шоттарға сәйкес келетін операция жоқ.',
    unmatchedRowsLabel: (count: number) => `Сәйкессіз операциялар: ${count}`,
    invoiceLabel: (number: string) => `Шот №${number}`,
    clientLabel: 'Клиент',
    amountLabel: 'Сома',
    statementDateLabel: 'Операция күні',
    descriptionLabel: 'Мақсаты',
    confirmPaymentButton: 'Төлемді растау',
    confirmingLabel: 'Растауда...',
    errorPrefix: (message: string) => `Қате: ${message}`,
  },
  en: {
    headerLabel: 'Acquiring',
    introText: 'Upload your account statement (Excel export from the Kaspi Pay app) — we\'ll match transactions to your open invoices by payer BIN and amount. The file is processed only in your browser and never sent anywhere.',
    proBadge: 'Pro',
    proLockedHint: 'Available on the Pro plan',
    goToPlansButton: 'View plans',
    loadingLabel: 'Loading...',
    chooseFileButton: 'Choose statement file (.xlsx)',
    fileChosenLabel: (name: string) => `File: ${name}`,
    processingLabel: 'Processing file...',
    noOpenInvoicesHint: 'No open invoices with a client BIN to match against.',
    matchesFoundLabel: (count: number) => `Matches found: ${count}`,
    noMatchesFoundHint: 'No matches found — no transaction matched an open invoice by BIN and amount.',
    unmatchedRowsLabel: (count: number) => `Unmatched transactions: ${count}`,
    invoiceLabel: (number: string) => `Invoice №${number}`,
    clientLabel: 'Client',
    amountLabel: 'Amount',
    statementDateLabel: 'Transaction date',
    descriptionLabel: 'Description',
    confirmPaymentButton: 'Confirm payment',
    confirmingLabel: 'Confirming...',
    errorPrefix: (message: string) => `Error: ${message}`,
  },
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/acquiring.ts
git commit -m "add i18n dict for the Acquiring page"
```

---

### Task 5: Nav entry in Profile

**Files:**
- Modify: `src/lib/i18n/profileCore.ts`
- Modify: `src/app/profile/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a working `/profile/acquiring` link in the Profile page's company section (the page itself is built in Task 6; this task only wires the nav entry, following exactly how `contractsMenuLabel` was added to this same file earlier).

- [ ] **Step 1: Add the i18n key**

In `src/lib/i18n/profileCore.ts`:

1. Add `acquiringMenuLabel: string` to the `ProfileCoreContent` interface, right after `securityMenuLabel: string`.
2. In the `ru` block, add `acquiringMenuLabel: 'Эквайринг',` right after the `securityMenuLabel:` line.
3. In the `kk` block, add `acquiringMenuLabel: 'Эквайринг',` right after the `securityMenuLabel:` line.
4. In the `en` block, add `acquiringMenuLabel: 'Acquiring',` right after the `securityMenuLabel:` line.

- [ ] **Step 2: Add the nav row**

In `src/app/profile/page.tsx`, find the `companyEl` array (the list containing `requisitesMenuLabel`, `signatureMenuLabel`, `banksMenuLabel`, `securityMenuLabel`, `connectorsMenuLabel`). Add a new entry right after the `securityMenuLabel` one:

```tsx
              { icon: '🔒', label: t.securityMenuLabel, href: '/profile/security' },
              { icon: '🏦', label: t.acquiringMenuLabel, href: '/profile/acquiring' },
              { icon: '🔗', label: t.connectorsMenuLabel, href: '/profile/connectors' },
```

(i.e. insert the new `{ icon: '🏦', ... }` line between the existing security and connectors lines.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (The `/profile/acquiring` route doesn't exist until Task 6 — that's fine, it's just a string href, not an import; Next.js won't error at typecheck time for an unbuilt route.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/profileCore.ts src/app/profile/page.tsx
git commit -m "add Acquiring nav entry to Profile page"
```

---

### Task 6: The `/profile/acquiring` page

**Files:**
- Create: `src/app/profile/acquiring/page.tsx`

**Interfaces:**
- Consumes: `getActivePlan` from `@/lib/plan` (Task 1); `parseStatementFile`, `AcquiringParseError` from `@/lib/acquiringParse` (Task 3); `findMatches`, `AcquiringMatch`, `OpenInvoice` from `@/lib/acquiringMatch` (Task 2); `acquiringDict` from `@/lib/i18n/acquiring` (Task 4); `supabase` from `@/lib/supabase`; `useLanguage` from `@/components/LanguageProvider`; `backLabel` from `@/lib/a11yLabels`.
- Produces: the page itself — nothing else depends on it.

- [ ] **Step 1: Create the page**

Create `src/app/profile/acquiring/page.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { parseStatementFile, AcquiringParseError } from '@/lib/acquiringParse'
import { findMatches, AcquiringMatch, OpenInvoice } from '@/lib/acquiringMatch'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { acquiringDict } from '@/lib/i18n/acquiring'

export default function AcquiringPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = acquiringDict[lang]

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([])
  const [matches, setMatches] = useState<AcquiringMatch[]>([])
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null)
  const [processing, setProcessing] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    if (getActivePlan(p).canAcquiring) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, number, client_name, client_bin, amount')
        .eq('user_id', user.id)
        .not('status', 'in', '(paid,cancelled)')
        .not('client_bin', 'is', null)
      setOpenInvoices((invoices as OpenInvoice[]) || [])
    }

    setLoading(false)
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setMatches([])
    setUnmatchedCount(null)
    setFileName(file.name)
    setProcessing(true)
    try {
      const rows = await parseStatementFile(file)
      const found = findMatches(rows, openInvoices)
      setMatches(found)
      setUnmatchedCount(rows.length - found.length)
    } catch (e: any) {
      setError(e instanceof AcquiringParseError ? e.message : (e?.message || String(e)))
    } finally {
      setProcessing(false)
    }
  }

  async function confirmPayment(match: AcquiringMatch) {
    setConfirmingId(match.invoice.id)
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', match.invoice.id)
    await supabase.from('invoice_logs').insert({ invoice_id: match.invoice.id, status: 'paid' })
    setMatches(prev => prev.filter(m => m.invoice.id !== match.invoice.id))
    setOpenInvoices(prev => prev.filter(i => i.id !== match.invoice.id))
    setConfirmingId(null)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  const ap = getActivePlan(profile)

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.headerLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {!ap.canAcquiring ? (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#1C2056]/5 flex items-center justify-center text-xl">🏦</div>
              <div className="text-sm font-medium text-[#1C2056] flex-1">{t.headerLabel}</div>
              <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                🔒 {t.proBadge}
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-3">{t.proLockedHint}</div>
            <button onClick={() => router.push('/upgrade')}
              className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
              {t.goToPlansButton}
            </button>
          </div>
        ) : (
          <>
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-xs text-gray-600 leading-relaxed">{t.introText}</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-4">
              <label className="block border-2 border-dashed border-gray-200 rounded-xl py-4 text-center cursor-pointer">
                <span className="text-sm text-[#1C2056]">
                  {fileName ? t.fileChosenLabel(fileName) : t.chooseFileButton}
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
              </label>
              {processing && <p className="text-xs text-gray-400 text-center mt-2">{t.processingLabel}</p>}
              {error && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(error)}</p>}
            </div>

            {openInvoices.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">{t.noOpenInvoicesHint}</p>
              </div>
            )}

            {fileName && !processing && !error && (
              <>
                <div className="text-xs text-gray-400 px-1">
                  {matches.length > 0 ? t.matchesFoundLabel(matches.length) : t.noMatchesFoundHint}
                  {unmatchedCount !== null && unmatchedCount > 0 && (
                    <span> · {t.unmatchedRowsLabel(unmatchedCount)}</span>
                  )}
                </div>

                {matches.map(match => (
                  <div key={match.invoice.id} className="bg-white rounded-2xl shadow-sm p-4">
                    <div className="text-sm font-medium text-[#1C2056]">{t.invoiceLabel(match.invoice.number)}</div>
                    <div className="text-xs text-gray-500 mt-1">{t.clientLabel}: {match.invoice.client_name || '—'}</div>
                    <div className="text-xs text-gray-500">{t.amountLabel}: {Number(match.invoice.amount).toLocaleString('ru-KZ')} ₸</div>
                    {match.row.date && <div className="text-xs text-gray-400 mt-1">{t.statementDateLabel}: {match.row.date}</div>}
                    {match.row.description && <div className="text-xs text-gray-400">{t.descriptionLabel}: {match.row.description}</div>}
                    <button onClick={() => confirmPayment(match)} disabled={confirmingId === match.invoice.id}
                      className="w-full bg-[#2DC48D] text-white rounded-xl py-2.5 text-sm font-medium mt-3">
                      {confirmingId === match.invoice.id ? t.confirmingLabel : t.confirmPaymentButton}
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, sign in as a Pro-plan user, navigate to `/profile/acquiring`. Confirm:
- Non-Pro account (or log in as one, or temporarily check via the admin panel's plan dropdown) sees the locked card, not the uploader.
- Pro account sees the intro text and file picker.
- Picking a non-`.xlsx` file shows the "Поддерживаются только файлы .xlsx или .xls" error.

- [ ] **Step 4: Commit**

```bash
git add src/app/profile/acquiring/page.tsx
git commit -m "add /profile/acquiring page: upload, parse, match, confirm"
```

---

### Task 7: Full verification, push, memory update

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing 13 + Task 1's new test + Task 2's 6 new tests = 20 total).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds successfully; `/profile/acquiring` appears in the route list.

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Update memory**

Write a new memory file (or extend an existing payments/plan-related one) documenting: the Acquiring feature exists, is Pro-gated, works via client-side Excel import + exact BIN/amount matching (no live bank API — every bank/provider checked in this session required a formal partnership with no fixed timeline), and that the Excel column-detection is untested against a real Kaspi Pay export (flag this as the first thing to verify once the user tries a real file). Update `MEMORY.md`'s index accordingly.

**Note for the acceptance step:** the very first time the user uploads a *real* Kaspi Pay statement export, watch closely for a parse error or a suspiciously-empty/wrong result — the header-detection logic in Task 3 is built without a real sample file and is the part of this plan most likely to need a follow-up fix once real data is available.
