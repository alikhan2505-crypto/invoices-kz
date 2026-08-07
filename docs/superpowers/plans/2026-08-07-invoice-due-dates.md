# Real Invoice Due Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every invoice a real, editable due date (`invoices.due_date`, already in the schema but unused), show it to the owner and the payer, and make the reminder/overdue cron and the manual "mark overdue" button compute from it instead of a fixed offset from `created_at`.

**Architecture:** No migration — `invoices.due_date` (type `date`, nullable) already exists. A new small pure-logic module (`src/lib/dueDate.ts`) centralizes date arithmetic so it's unit-testable; every UI/cron change is a thin consumer of it. Every invoice-notification query branches on whether `due_date` is set: if set, use it; if `NULL` (every one of the 47 invoices existing today, and any future invoice where the field is cleared), fall back to the exact existing fixed-offset behavior — permanently, not as a one-time migration path.

**Tech Stack:** Next.js App Router, Supabase (Postgres + PostgREST), Vitest.

## Global Constraints

- Due date is auto-computed at invoice-creation time as `invoice date + profile.default_due_days` days, with `default_due_days` (stored as text) falling back to `3` if it's empty, non-numeric, or ≤ 0. It is always user-editable via a native `<input type="date">`, both at creation and later via edit.
- Reminder fires when `due_date = today + 1 day` (once — the cron runs daily and a `date`-type equality check naturally can't re-match the same invoice twice).
- Overdue fires when `due_date < today - 1 day` (a 1-day grace period after the due date).
- Invoices with `due_date IS NULL` keep the exact old fixed-offset behavior forever as a fallback: 3-day reminder / 7-day overdue, both counted from `created_at`. This is not a one-time backfill — it must keep working indefinitely for any invoice that never gets a due date.
- `default_due_days` is a snapshot used only at the moment of invoice creation. Changing the setting later never recomputes any existing invoice's `due_date`.
- No new abstractions beyond what's specified below — reuse `src/lib/date.ts`'s `formatDate` for all display formatting.

---

### Task 1: Date-arithmetic helper (`src/lib/dueDate.ts`)

**Files:**
- Create: `src/lib/dueDate.ts`
- Test: `src/lib/dueDate.test.ts`

**Interfaces:**
- Produces: `addDaysToDateString(dateStr: string, days: number): string` (YYYY-MM-DD in, YYYY-MM-DD out, UTC-based so it's stable regardless of server timezone). `todayDateString(): string` (today as YYYY-MM-DD, UTC). `computeDefaultDueDate(invoiceDateStr: string, defaultDueDaysRaw: string | null | undefined): string` (applies the fallback-to-3 rule from Global Constraints). These three are consumed by Tasks 3, 7, and 8.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { addDaysToDateString, todayDateString, computeDefaultDueDate } from './dueDate'

describe('addDaysToDateString', () => {
  it('adds positive days within a month', () => {
    expect(addDaysToDateString('2026-08-07', 3)).toBe('2026-08-10')
  })

  it('subtracts days with a negative offset', () => {
    expect(addDaysToDateString('2026-08-07', -1)).toBe('2026-08-06')
  })

  it('rolls over a month boundary', () => {
    expect(addDaysToDateString('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('rolls over a year boundary', () => {
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('todayDateString', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('computeDefaultDueDate', () => {
  it('adds the configured number of days', () => {
    expect(computeDefaultDueDate('2026-08-07', '10')).toBe('2026-08-17')
  })

  it('falls back to 3 days when the setting is empty', () => {
    expect(computeDefaultDueDate('2026-08-07', '')).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is undefined', () => {
    expect(computeDefaultDueDate('2026-08-07', undefined)).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is null', () => {
    expect(computeDefaultDueDate('2026-08-07', null)).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is not a number', () => {
    expect(computeDefaultDueDate('2026-08-07', 'abc')).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is zero', () => {
    expect(computeDefaultDueDate('2026-08-07', '0')).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is negative', () => {
    expect(computeDefaultDueDate('2026-08-07', '-5')).toBe('2026-08-10')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/dueDate.test.ts`
Expected: FAIL — `Cannot find module './dueDate'`

- [ ] **Step 3: Write the implementation**

```ts
// Pure YYYY-MM-DD arithmetic, UTC-based throughout so results don't drift
// with the server's local timezone (the cron runs in UTC; invoices.due_date
// is a plain `date` column with no timezone of its own).

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

// defaultDueDaysRaw comes from profiles.default_due_days, stored as text.
// Anything that isn't a valid positive number falls back to 3 — matches
// the field's own placeholder/default value on /profile/settings.
export function computeDefaultDueDate(
  invoiceDateStr: string,
  defaultDueDaysRaw: string | null | undefined
): string {
  const n = Number(defaultDueDaysRaw)
  const days = Number.isFinite(n) && n > 0 ? n : 3
  return addDaysToDateString(invoiceDateStr, days)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/dueDate.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dueDate.ts src/lib/dueDate.test.ts
git commit -m "feat(due-dates): add date-arithmetic helper with default-due-days fallback"
```

---

### Task 2: Shared display capability — PDF template, live preview, i18n

**Files:**
- Modify: `src/lib/generatePDF.ts:33-53` (interface), `:219` (render)
- Modify: `src/components/InvoiceLivePreview.tsx`
- Modify: `src/lib/i18n/invoiceFlow.ts:19-20,206-207,400-401,594-595`
- Modify: `src/lib/i18n/history.ts:41-42,126-127,209-210,292-293`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `InvoiceData.dueDate?: string` (pre-formatted display string, e.g. `formatDate()`'s output — NOT a raw `YYYY-MM-DD`) consumed by Tasks 3, 5, 6. `InvoiceLivePreviewProps.dueDate?: string` (same, pre-formatted) consumed by Tasks 3 and 5. `t.dueDateLabel` (both `invoiceFlowDict` and `historyDict`) consumed by Tasks 3, 4, 5, 6.

- [ ] **Step 1: Add `dueDate` to `InvoiceData` and render it**

In `src/lib/generatePDF.ts`, change:

```ts
  contractNumber?: string
  contractDate?: string
  kaspiPayLink?: string
  viewUrl?: string
  showWatermark?: boolean
}
```

to:

```ts
  contractNumber?: string
  contractDate?: string
  kaspiPayLink?: string
  viewUrl?: string
  dueDate?: string
  showWatermark?: boolean
}
```

Then change:

```ts
      <div class="title">Счет на оплату №${data.number} от ${data.date}</div>
```

to:

```ts
      <div class="title">Счет на оплату №${data.number} от ${data.date}</div>
      ${data.dueDate ? `<div style="font-size:11px;color:#6b7280;margin-top:-8px;margin-bottom:10px;">Срок оплаты: ${data.dueDate}</div>` : ''}
```

- [ ] **Step 2: Add `dueDate` prop to `InvoiceLivePreview`**

In `src/components/InvoiceLivePreview.tsx`, change:

```ts
export interface InvoiceLivePreviewProps {
  invoiceNumber: string
  date: string
  companyName: string
```

to:

```ts
export interface InvoiceLivePreviewProps {
  invoiceNumber: string
  date: string
  dueDate?: string
  companyName: string
```

Change:

```ts
export default function InvoiceLivePreview({
  invoiceNumber,
  date,
  companyName,
```

to:

```ts
export default function InvoiceLivePreview({
  invoiceNumber,
  date,
  dueDate,
  companyName,
```

Then, right after the header block closes (the `<div className="flex items-start justify-between mb-4">...</div>`, immediately before the `{/* From */}` comment), insert:

```tsx
      {dueDate && (
        <div className="text-xs text-gray-400 mb-3">{t.dueDateLabel}: {dueDate}</div>
      )}
```

So the header + new line reads:

```tsx
      <div className="flex items-start justify-between mb-4">
        <div className="text-lg font-bold tracking-wide text-[#1C2056]">{invoiceNumber}</div>
        <div className="text-xs text-gray-400 bg-gray-50 rounded-full px-2.5 py-1">{date}</div>
      </div>

      {dueDate && (
        <div className="text-xs text-gray-400 mb-3">{t.dueDateLabel}: {dueDate}</div>
      )}

      {/* From */}
```

- [ ] **Step 3: Add `dueDateLabel` to `invoiceFlowDict`**

In `src/lib/i18n/invoiceFlow.ts`, change:

```ts
  contractDateLabel: string
  contractDatePlaceholder: string
```

to:

```ts
  contractDateLabel: string
  contractDatePlaceholder: string
  dueDateLabel: string
```

Then add the value to each of the three language blocks, right after their `contractDatePlaceholder` line:

Russian block (after `contractDatePlaceholder: '01.01.2026',` at line 207):
```ts
    dueDateLabel: 'Срок оплаты',
```

Kazakh block (after `contractDatePlaceholder: '01.01.2026',` at line 401):
```ts
    dueDateLabel: 'Төлеу мерзімі',
```

English block (after `contractDatePlaceholder: '01.01.2026',` at line 595):
```ts
    dueDateLabel: 'Due date',
```

- [ ] **Step 4: Add `dueDateLabel` to `historyDict`**

In `src/lib/i18n/history.ts`, change:

```ts
  invoiceForPaymentLabel: string
  fromLabel: string
```

to:

```ts
  invoiceForPaymentLabel: string
  dueDateLabel: string
  fromLabel: string
```

Then add the value to each of the three language blocks, right after their `invoiceForPaymentLabel` line:

Russian block (after `invoiceForPaymentLabel: 'Счёт на оплату',` at line 126):
```ts
    dueDateLabel: 'Срок оплаты',
```

Kazakh block (after `invoiceForPaymentLabel: 'Төлеуге арналған шот',` at line 209):
```ts
    dueDateLabel: 'Төлеу мерзімі',
```

English block (after `invoiceForPaymentLabel: 'Invoice for payment',` at line 292):
```ts
    dueDateLabel: 'Due date',
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (existing callers of `InvoiceLivePreview` and `generateInvoicePDF` don't pass `dueDate` yet — both are optional, so this must stay clean).

- [ ] **Step 6: Commit**

```bash
git add src/lib/generatePDF.ts src/components/InvoiceLivePreview.tsx src/lib/i18n/invoiceFlow.ts src/lib/i18n/history.ts
git commit -m "feat(due-dates): add due-date display support to PDF, live preview, i18n"
```

---

### Task 3: Set due date at invoice creation (`/dashboard`)

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `computeDefaultDueDate`, `todayDateString` from `src/lib/dueDate.ts` (Task 1). `InvoiceData.dueDate`, `InvoiceLivePreviewProps.dueDate`, `t.dueDateLabel` (Task 2).
- Produces: `invoices.due_date` written on every new invoice created from this page.

- [ ] **Step 1: Import the new helper**

Change:

```ts
import { formatDate } from '@/lib/date'
```

to:

```ts
import { formatDate } from '@/lib/date'
import { computeDefaultDueDate, todayDateString } from '@/lib/dueDate'
```

- [ ] **Step 2: Add `dueDate` state**

Change:

```ts
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
```

to:

```ts
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [dueDate, setDueDate] = useState('')
```

- [ ] **Step 3: Compute the default once the profile loads**

In `load()`, change:

```ts
    setProfile(p)
    setProfileLoaded(true)
    if (p) cacheSet('profile_' + user.id, p)
    if (p?.default_note) setNote(p.default_note)
```

to:

```ts
    setProfile(p)
    setProfileLoaded(true)
    if (p) cacheSet('profile_' + user.id, p)
    if (p?.default_note) setNote(p.default_note)
    setDueDate(computeDefaultDueDate(todayDateString(), p?.default_due_days))
```

- [ ] **Step 4: Recompute the default when the form clears after creating an invoice**

In `clearClient()`, change:

```ts
  function clearClient() {
    setClientName('')
    setClientBin('')
    setClientEmail('')
    setClientAddress('')
    setClientPhone('')
    setContractNumber('')
    setContractDate('')
    setClientKnp('849')
    setClientSelected(false)
    setNote('')
  }
```

to:

```ts
  function clearClient() {
    setClientName('')
    setClientBin('')
    setClientEmail('')
    setClientAddress('')
    setClientPhone('')
    setContractNumber('')
    setContractDate('')
    setClientKnp('849')
    setClientSelected(false)
    setNote('')
    setDueDate(computeDefaultDueDate(todayDateString(), profile?.default_due_days))
  }
```

- [ ] **Step 5: Add the date input to both form branches**

There are two near-identical JSX branches (one for a client picked from the directory, one for manual entry), each containing a `grid-cols-2` row with `contractNumber`/`contractDate`. In **both** branches, add a new field immediately after that grid's closing `</div>`.

First occurrence — change:

```tsx
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractNumberLabelDashboard}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractDateLabel}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractDatePlaceholder} value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
              </div>
            ) : (
```

to:

```tsx
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractNumberLabelDashboard}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractDateLabel}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractDatePlaceholder} value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.dueDateLabel}</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>
            ) : (
```

Second occurrence — change:

```tsx
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractNumberLabelDashboard}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractDateLabel}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractDatePlaceholder} value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.knpLabel}</label>
```

to:

```tsx
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractNumberLabelDashboard}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t.contractDateLabel}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                      placeholder={t.contractDatePlaceholder} value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.dueDateLabel}</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{t.knpLabel}</label>
```

- [ ] **Step 6: Write `due_date` on the multi-bank path's DB insert, and thread it through `pendingInvoiceData`**

In `createInvoice()`, change the insert call:

```ts
    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      number: invoiceNumber,
      amount: total,
      status: 'draft',
      client_name: clientName,
      client_bin: clientBin,
      client_email: clientEmail,
      client_address: clientAddress,
      client_phone: clientPhone || null,
      contract_number: contractNumber || null,
      contract_date: contractDate || null,
      services,
      note: note || profile?.default_note || null,
    }).select().single()
```

to:

```ts
    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      number: invoiceNumber,
      amount: total,
      status: 'draft',
      client_name: clientName,
      client_bin: clientBin,
      client_email: clientEmail,
      client_address: clientAddress,
      client_phone: clientPhone || null,
      contract_number: contractNumber || null,
      contract_date: contractDate || null,
      due_date: dueDate || null,
      services,
      note: note || profile?.default_note || null,
    }).select().single()
```

Change `pendingInvoiceData`:

```ts
      setPendingInvoiceData({
        invoiceNumber: data.number,
        invoiceDate,
        cn: clientName, cb: clientBin, ce: clientEmail,
        ca: clientAddress, cp: clientPhone,
        cn2: contractNumber, cd: contractDate,
        knp: clientKnp, svcs: services, tot: total, nt: note,
        pt: data.public_token,
      })
```

to:

```ts
      setPendingInvoiceData({
        invoiceNumber: data.number,
        invoiceDate,
        cn: clientName, cb: clientBin, ce: clientEmail,
        ca: clientAddress, cp: clientPhone,
        cn2: contractNumber, cd: contractDate,
        knp: clientKnp, svcs: services, tot: total, nt: note,
        pt: data.public_token,
        dd: dueDate,
      })
```

- [ ] **Step 7: Pass `dueDate` into both `generateInvoicePDF` calls and the live preview**

In `generateWithBank`, change the destructuring:

```ts
    const { invoiceNumber, invoiceDate, cn, cb, ce, ca, cp, cn2, cd, svcs, tot, nt, knp, pt } = pendingInvoiceData
```

to:

```ts
    const { invoiceNumber, invoiceDate, cn, cb, ce, ca, cp, cn2, cd, svcs, tot, nt, knp, pt, dd } = pendingInvoiceData
```

Then in that same function's `generateInvoicePDF({...})` call, change:

```ts
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: pt ? `https://www.invoices.kz/view/${pt}` : undefined,
      showWatermark: !getActivePlan(profile).isActive,
    })
    setShowBankPicker(false)
```

to:

```ts
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: pt ? `https://www.invoices.kz/view/${pt}` : undefined,
      dueDate: dd ? formatDate(dd) : undefined,
      showWatermark: !getActivePlan(profile).isActive,
    })
    setShowBankPicker(false)
```

In `createInvoice()`'s single-bank-path `generateInvoicePDF({...})` call, change:

```ts
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: data.public_token ? `https://www.invoices.kz/view/${data.public_token}` : undefined,
      showWatermark: !getActivePlan(profile).isActive,
    })
    if (win) { win.document.write(html); win.document.close() }

    clearClient()
```

to:

```ts
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: data.public_token ? `https://www.invoices.kz/view/${data.public_token}` : undefined,
      dueDate: dueDate ? formatDate(dueDate) : undefined,
      showWatermark: !getActivePlan(profile).isActive,
    })
    if (win) { win.document.write(html); win.document.close() }

    clearClient()
```

In the desktop `InvoiceLivePreview`, change:

```tsx
          <InvoiceLivePreview
            invoiceNumber={!profileLoaded ? '' : (profile?.invoice_prefix || 'INV-') + (profile?.invoice_next_number || '0001')}
            date={formatDate(new Date().toISOString())}
            companyName={profile?.company_name || ''}
```

to:

```tsx
          <InvoiceLivePreview
            invoiceNumber={!profileLoaded ? '' : (profile?.invoice_prefix || 'INV-') + (profile?.invoice_next_number || '0001')}
            date={formatDate(new Date().toISOString())}
            dueDate={dueDate ? formatDate(dueDate) : undefined}
            companyName={profile?.company_name || ''}
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(due-dates): set and edit due date when creating an invoice"
```

---

### Task 4: Edit due date on an existing invoice (`/invoice/[id]/edit`)

**Files:**
- Modify: `src/app/invoice/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `t.dueDateLabel` (Task 2).
- Produces: `invoices.due_date` writable from the edit form.

- [ ] **Step 1: Add `dueDate` state**

Change:

```ts
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
```

to:

```ts
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [dueDate, setDueDate] = useState('')
```

- [ ] **Step 2: Load it from the invoice**

Change:

```ts
      setContractNumber(inv.contract_number || '')
      setContractDate(inv.contract_date || '')
```

to:

```ts
      setContractNumber(inv.contract_number || '')
      setContractDate(inv.contract_date || '')
      setDueDate(inv.due_date || '')
```

- [ ] **Step 3: Add the field to the Contract card**

Change:

```tsx
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.contractDateLabel}</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.contractDatePlaceholder} value={contractDate}
                onChange={e => setContractDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Services */}
```

to:

```tsx
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.contractDateLabel}</label>
              <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.contractDatePlaceholder} value={contractDate}
                onChange={e => setContractDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1 block">{t.dueDateLabel}</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
              value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        {/* Services */}
```

- [ ] **Step 4: Save it**

Change:

```ts
      contract_number: contractNumber || null,
      contract_date: contractDate || null,
      services,
      amount: total,
      note: note || null,
    }).eq('id', id)
```

to:

```ts
      contract_number: contractNumber || null,
      contract_date: contractDate || null,
      due_date: dueDate || null,
      services,
      amount: total,
      note: note || null,
    }).eq('id', id)
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/invoice/[id]/edit/page.tsx"
git commit -m "feat(due-dates): allow editing due date on an existing invoice"
```

---

### Task 5: Show and thread due date on the owner's invoice page (`/invoice/[id]`)

**Files:**
- Modify: `src/app/invoice/[id]/page.tsx`

**Interfaces:**
- Consumes: `InvoiceData.dueDate`, `InvoiceLivePreviewProps.dueDate` (Task 2). `invoice.due_date` is already loaded (this page does `select('*')`).

- [ ] **Step 1: Pass `dueDate` into `openPDF`'s `generateInvoicePDF` call**

Change:

```ts
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: invoice.public_token ? `https://www.invoices.kz/view/${invoice.public_token}` : undefined,
      showWatermark: !ap.isActive,
    })
    if (win) { win.document.write(html); win.document.close() }
  }
```

to:

```ts
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: invoice.public_token ? `https://www.invoices.kz/view/${invoice.public_token}` : undefined,
      dueDate: invoice.due_date ? formatDate(invoice.due_date) : undefined,
      showWatermark: !ap.isActive,
    })
    if (win) { win.document.write(html); win.document.close() }
  }
```

(This is the block ending around line 294 — there are two `kaspiPayLink`/`viewUrl` pairs in this file, this step is for the one inside the standalone `openPDF` function, not the `SignatureSection` one below.)

- [ ] **Step 2: Pass `dueDate` into the SignatureSection `getHtml` call**

Change:

```ts
            bank: bank ? { bank_name: bank.bank_name, iik: bank.iik, bik: bank.bik, kbe: bank.kbe } : undefined,
            kaspiPayLink: profile?.kaspi_pay_link || undefined,
            viewUrl: invoice.public_token ? `https://www.invoices.kz/view/${invoice.public_token}` : undefined,
            showWatermark: !ap.isActive,
          })}
        />
```

to:

```ts
            bank: bank ? { bank_name: bank.bank_name, iik: bank.iik, bik: bank.bik, kbe: bank.kbe } : undefined,
            kaspiPayLink: profile?.kaspi_pay_link || undefined,
            viewUrl: invoice.public_token ? `https://www.invoices.kz/view/${invoice.public_token}` : undefined,
            dueDate: invoice.due_date ? formatDate(invoice.due_date) : undefined,
            showWatermark: !ap.isActive,
          })}
        />
```

- [ ] **Step 3: Pass `dueDate` into the desktop `InvoiceLivePreview`**

Change:

```tsx
        <InvoiceLivePreview
          invoiceNumber={invoice.number}
          date={formatDate(invoice.created_at)}
          companyName={profile?.company_name || ''}
```

to:

```tsx
        <InvoiceLivePreview
          invoiceNumber={invoice.number}
          date={formatDate(invoice.created_at)}
          dueDate={invoice.due_date ? formatDate(invoice.due_date) : undefined}
          companyName={profile?.company_name || ''}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/invoice/[id]/page.tsx"
git commit -m "feat(due-dates): show due date on the owner's invoice page and PDF"
```

---

### Task 6: Show and thread due date on the public invoice page (`/view/[token]`)

**Files:**
- Modify: `src/app/view/[token]/page.tsx`

**Interfaces:**
- Consumes: `InvoiceData.dueDate` (Task 2), `t.dueDateLabel` from `historyDict` (Task 2). `invoice.due_date` is already loaded (this page does `select('*')`).

- [ ] **Step 1: Show the due date next to the invoice date**

Change:

```tsx
              <div className="text-xl font-bold text-[#1C2056]">{invoice.number}</div>
              <div className="text-xs text-gray-400 mt-1">{formatDate(invoice.created_at)}</div>
            </div>
```

to:

```tsx
              <div className="text-xl font-bold text-[#1C2056]">{invoice.number}</div>
              <div className="text-xs text-gray-400 mt-1">{formatDate(invoice.created_at)}</div>
              {invoice.due_date && (
                <div className="text-xs text-gray-400 mt-1">{t.dueDateLabel}: {formatDate(invoice.due_date)}</div>
              )}
            </div>
```

- [ ] **Step 2: Pass `dueDate` into this page's own `openPDF`**

Change:

```ts
      note: invoice.note || '',
      profile: {
        company_name: profile?.company_name || '',
        bin_iin: profile?.bin_iin || '',
        address: profile?.address || '',
        director_name: profile?.director_name || '',
        signature_url: profile?.signature_url || '',
        stamp_url: profile?.stamp_url || '',
      },
      bank: bank ? {
        bank_name: bank.bank_name,
        iik: bank.iik,
        bik: bank.bik,
        kbe: bank.kbe,
      } : undefined,
      autoPrint: false,
    })
```

to:

```ts
      note: invoice.note || '',
      profile: {
        company_name: profile?.company_name || '',
        bin_iin: profile?.bin_iin || '',
        address: profile?.address || '',
        director_name: profile?.director_name || '',
        signature_url: profile?.signature_url || '',
        stamp_url: profile?.stamp_url || '',
      },
      bank: bank ? {
        bank_name: bank.bank_name,
        iik: bank.iik,
        bik: bank.bik,
        kbe: bank.kbe,
      } : undefined,
      dueDate: invoice.due_date ? formatDate(invoice.due_date) : undefined,
      autoPrint: false,
    })
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/view/[token]/page.tsx"
git commit -m "feat(due-dates): show due date on the public invoice page and PDF"
```

---

### Task 7: Due-date-aware reminder and overdue cron

**Files:**
- Modify: `src/app/api/cron/notifications/route.ts`

**Interfaces:**
- Consumes: `addDaysToDateString`, `todayDateString` from `src/lib/dueDate.ts` (Task 1).

- [ ] **Step 1: Import the helper**

Change:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendTelegramNotification } from '@/lib/telegramNotify'
```

to:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { addDaysToDateString, todayDateString } from '@/lib/dueDate'
```

- [ ] **Step 2: Split the reminder query into due-date and legacy branches**

Change:

```ts
  // --- Payment reminder: sent 3 days ago, still unpaid ---
  const { data: reminderInvoices } = await supabase
    .from('invoices')
    .select('id, number, amount, client_name, profiles(email, notify_payment_reminder, notify_telegram, telegram_chat_id)')
    .in('status', ['sent', 'viewed'])
    .gte('created_at', startOfDayAgo(3).toISOString())
    .lt('created_at', startOfDayAgo(2).toISOString())

  for (const inv of (reminderInvoices || []) as any[]) {
```

to:

```ts
  // --- Payment reminder ---
  // Invoices with a real due_date: remind exactly 1 day before it's due
  // (date equality is safe against double-sending since the cron runs once
  // a day). Invoices without one (every invoice created before this
  // feature existed, or wherever the date was cleared): keep the original
  // heuristic, 3 days after the invoice was sent, still unpaid.
  const reminderDueDateTarget = addDaysToDateString(todayDateString(), 1)
  const { data: reminderByDueDate } = await supabase
    .from('invoices')
    .select('id, number, amount, client_name, profiles(email, notify_payment_reminder, notify_telegram, telegram_chat_id)')
    .in('status', ['sent', 'viewed'])
    .eq('due_date', reminderDueDateTarget)

  const { data: reminderLegacy } = await supabase
    .from('invoices')
    .select('id, number, amount, client_name, profiles(email, notify_payment_reminder, notify_telegram, telegram_chat_id)')
    .in('status', ['sent', 'viewed'])
    .is('due_date', null)
    .gte('created_at', startOfDayAgo(3).toISOString())
    .lt('created_at', startOfDayAgo(2).toISOString())

  for (const inv of [...(reminderByDueDate || []), ...(reminderLegacy || [])] as any[]) {
```

- [ ] **Step 3: Split the overdue query the same way**

Change:

```ts
  // --- Overdue: sent 7+ days ago, still unpaid — transition status + notify owner ---
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('id, number, amount, client_name, profiles(email, notify_overdue, notify_telegram, telegram_chat_id)')
    .in('status', ['sent', 'viewed'])
    .lt('created_at', startOfDayAgo(7).toISOString())

  for (const inv of (overdueInvoices || []) as any[]) {
```

to:

```ts
  // --- Overdue: transition status + notify owner ---
  // Invoices with a real due_date: overdue once the due date is more than
  // 1 day in the past (a short grace period). Invoices without one: the
  // original heuristic, 7+ days since the invoice was sent.
  const overdueDueDateTarget = addDaysToDateString(todayDateString(), -1)
  const { data: overdueByDueDate } = await supabase
    .from('invoices')
    .select('id, number, amount, client_name, profiles(email, notify_overdue, notify_telegram, telegram_chat_id)')
    .in('status', ['sent', 'viewed'])
    .lt('due_date', overdueDueDateTarget)

  const { data: overdueLegacy } = await supabase
    .from('invoices')
    .select('id, number, amount, client_name, profiles(email, notify_overdue, notify_telegram, telegram_chat_id)')
    .in('status', ['sent', 'viewed'])
    .is('due_date', null)
    .lt('created_at', startOfDayAgo(7).toISOString())

  for (const inv of [...(overdueByDueDate || []), ...(overdueLegacy || [])] as any[]) {
```

The rest of both loop bodies (the status update, email try/catch, and Telegram send) is unchanged — only the query and the `for` line above them change.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/notifications/route.ts
git commit -m "feat(due-dates): make the reminder/overdue cron due-date-aware, with a legacy fallback"
```

---

### Task 8: Due-date-aware manual "mark overdue" button (`/history`)

**Files:**
- Modify: `src/app/history/page.tsx`

**Interfaces:**
- Consumes: `addDaysToDateString`, `todayDateString` from `src/lib/dueDate.ts` (Task 1).

- [ ] **Step 1: Import the helper**

Change:

```ts
import { formatDateTime, formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
```

to:

```ts
import { formatDateTime, formatDate } from '@/lib/date'
import { addDaysToDateString, todayDateString } from '@/lib/dueDate'
import { useLanguage } from '@/components/LanguageProvider'
```

- [ ] **Step 2: Split `markOverdue()` into due-date and legacy branches**

Change:

```ts
  async function markOverdue() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'overdue' })
      .eq('user_id', user.id)
      .in('status', ['sent', 'viewed'])
      .lt('created_at', sevenDaysAgo.toISOString())
      .select()
    if (error) { alert(t.errorPrefix(error.message)); return }
    if (data && data.length > 0) {
      alert(t.markedOverdueMessage(data.length))
      loadInvoices()
    } else {
      alert(t.noOverdueInvoicesAlert)
    }
  }
```

to:

```ts
  async function markOverdue() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const overdueDueDateTarget = addDaysToDateString(todayDateString(), -1)

    const { data: byDueDate, error: dueDateError } = await supabase
      .from('invoices')
      .update({ status: 'overdue' })
      .eq('user_id', user.id)
      .in('status', ['sent', 'viewed'])
      .lt('due_date', overdueDueDateTarget)
      .select()
    if (dueDateError) { alert(t.errorPrefix(dueDateError.message)); return }

    const { data: legacy, error: legacyError } = await supabase
      .from('invoices')
      .update({ status: 'overdue' })
      .eq('user_id', user.id)
      .in('status', ['sent', 'viewed'])
      .is('due_date', null)
      .lt('created_at', sevenDaysAgo.toISOString())
      .select()
    if (legacyError) { alert(t.errorPrefix(legacyError.message)); return }

    const total = (byDueDate?.length || 0) + (legacy?.length || 0)
    if (total > 0) {
      alert(t.markedOverdueMessage(total))
      loadInvoices()
    } else {
      alert(t.noOverdueInvoicesAlert)
    }
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/history/page.tsx
git commit -m "feat(due-dates): make the manual overdue button due-date-aware, with a legacy fallback"
```

---

### Task 9: Final verification and deploy

**Files:** none new — verification only.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing suite + Task 1's 11 new `dueDate.ts` tests).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Push**

```bash
git push origin main
```

No further manual steps after deploy — unlike the Telegram feature, this doesn't need any new env vars or external registration. The next invoice created will have a real due date; existing invoices keep working exactly as before via the legacy fallback.
