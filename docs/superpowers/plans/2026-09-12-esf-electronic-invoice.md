# ЭСФ (Electronic Tax Invoice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a VAT-paying invoices.kz merchant issue an official ЭСФ (Kazakhstan's electronic tax invoice, ИС ЭСФ / kgd.gov.kz) from an existing platform invoice, for the simplest case only (`ORDINARY_INVOICE`, standard-rate VAT, no corrections/returns/exemptions/excise).

**Architecture:** A new `esfXml` library builds a Kazakhstan-government `InvoiceV2` XML document from an existing invoice + seller profile + already-known buyer VAT status, signs it via the platform's existing SIGEX/eGov QR ceremony, and submits it over SOAP (`createSession` + `syncInvoice`) to ИС ЭСФ, which replies synchronously with accept/decline — no webhook or polling needed. Each merchant holds their own pre-existing ИС ЭСФ credentials (login/password + two X.509 certificates), stored encrypted per-user, the same way `kaspiPay` stores per-user secrets today.

**Tech Stack:** Next.js 15 App Router API routes, Supabase (tables applied directly against the live project, no committed migration file — this repo's established pattern), the existing `sigex-qr-signing-client` package, native `fetch` for SOAP calls (no new SOAP library — the request/response bodies are simple enough to hand-build as strings).

## Global Constraints

- Scope is the simple case ONLY: `invoiceType = ORDINARY_INVOICE`, no `relatedInvoice`, no excise (`totalExciseAmount` always `0.00`), one seller, one or more line items with a standard integer VAT rate (0-100).
- Reuse `encryptAtRest`/`decryptAtRest` from `src/lib/kaspiPay/crypto.ts` for all new encrypted columns — do not write new crypto code.
- New DB tables are applied directly against the live Supabase project (via the Supabase MCP tool's `execute_sql` or `apply_migration`), never as a committed `.sql` file — this matches every existing table in this codebase (`kaspi_connections`, `kaspi_payment_requests`, etc., none of which have migration files).
- Gating follows the existing two-layer pattern from `src/lib/plan.ts`: a `canEsf` flag hides the UI action, and every new `/api/esf/*` route independently re-checks it server-side (403 if false) — server-side is the authority, per the identical comment already in `src/app/api/signatures/owner-sign/route.ts:98-104`.
- All money/decimal fields sent to ИС ЭСФ use exactly 2 fraction digits as a string (`toFixed(2)`), matching the XSD's `fractionDigits value="2"` constraint on every `xs:decimal` field in `InvoiceV2.xsd`.
- `catalogTruId` is a required field per `InvoiceV2.xsd` (`Product.catalogTruId`, `minOccurs="1"`), but the government's own reference sample (`sdk/XML templates/One InvoiceV2.xml`, bundled in `esf-sdk-2025.zip`) uses the literal value `"1"` for every product regardless of what it is. This plan hardcodes `"1"` for the same field for the same reason — a real per-product TRU catalog lookup is out of scope for the simple case and would need its own spec if ИС ЭСФ's sandbox ever rejects it.

---

## Task 1: Live spike — verify SIGEX/eGov signing supports a GOST certificate

**Files:**
- Create: `src/app/api/esf/spike-sign/route.ts` (temporary, admin-only diagnostic route — delete in Task 1's own last step once the spike is resolved, matching this codebase's established pattern of removing one-off diagnostic routes after use, e.g. the Kaspi photo-backfill diagnostics removed in commit `bb89bda`)
- Create: `src/app/profile/esf-spike/page.tsx` (temporary diagnostic page, admin-only — deleted alongside the route)

**Interfaces:**
- Consumes: `runSigexQrSigning` from `src/lib/signDocument.ts` (existing, exported, signature: `runSigexQrSigning(title: string, dataBlob: Blob, onQrReady: (qrDataUrl: string, eGovLink: string) => void): Promise<string>` returning the base64 CMS signature — confirm the exact exported signature by reading that file before writing this task's code, since this plan was not able to inline it verbatim).
- Produces: nothing consumed by later tasks — this task's only output is a human observation recorded in this plan's own checklist, which determines whether Task 5 reuses `runSigexQrSigning` as-is or needs a different signing path (a decision point, not a code dependency).

This task cannot follow the plan's normal TDD steps — there is no assertion that proves a live human, holding a real phone with a real certificate, saw what we need them to see. Every step here is a literal instruction, not a template.

- [ ] **Step 1: Confirm the exact export from `signDocument.ts`**

Read `src/lib/signDocument.ts` in full. Confirm the exact name, parameters, and return type of the function that runs the QR/eGov signing ceremony (referred to above as `runSigexQrSigning` per the earlier investigation report — the real name may differ slightly). Write down the confirmed signature before proceeding; Step 3 below must call it exactly.

- [ ] **Step 2: Build a minimal sample payload to sign**

The SDK's own sample invoice XML is the natural payload — it's a real, government-authored `InvoiceV2` document, so signing it now is representative of what Task 5 will actually sign later. Copy it into the new route as a literal string (not a file read, so the diagnostic route has zero external dependencies):

```typescript
// src/app/api/esf/spike-sign/route.ts
import { NextRequest, NextResponse } from 'next/server'

// Verbatim from esf-sdk-2025.zip's "sdk/XML templates/One InvoiceV2.xml"
// (Kazakhstan government's own reference sample) -- used here only as a
// realistic payload to sign, not submitted anywhere.
const SAMPLE_INVOICE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<esf:invoiceContainer xmlns:esf="esf">
    <invoiceSet>
        <v2:invoice xmlns:a="abstractInvoice.esf" xmlns:v2="v2.esf">
            <date>03.10.2017</date>
            <invoiceType>ORDINARY_INVOICE</invoiceType>
            <num>2038556421124573223</num>
            <operatorFullname>Иванов Иван Иванович</operatorFullname>
            <turnoverDate>02.10.2017</turnoverDate>
            <customers>
                <customer>
                    <address>Казахстан, Акмолинская обл., г. Астана, ул. ПРОСПЕКТ РАКЫМЖАН КОШКАРБАЕВ, д. 66</address>
                    <countryCode>KZ</countryCode>
                    <name>ИП БРЮС УЭЙН</name>
                    <tin>123456789011</tin>
                </customer>
            </customers>
            <productSet>
                <currencyCode>KZT</currencyCode>
                <products>
                    <product>
                        <catalogTruId>1</catalogTruId>
                        <description>Тестовый товар</description>
                        <ndsAmount>468</ndsAmount>
                        <ndsRate>12</ndsRate>
                        <priceWithTax>4368</priceWithTax>
                        <priceWithoutTax>3900</priceWithoutTax>
                        <quantity>1</quantity>
                        <turnoverSize>3900</turnoverSize>
                        <unitCode>3004200002</unitCode>
                        <unitNomenclature>796</unitNomenclature>
                        <unitPrice>3900</unitPrice>
                    </product>
                </products>
                <totalExciseAmount>0</totalExciseAmount>
                <totalNdsAmount>468</totalNdsAmount>
                <totalPriceWithTax>4368</totalPriceWithTax>
                <totalPriceWithoutTax>3900</totalPriceWithoutTax>
                <totalTurnoverSize>3900</totalTurnoverSize>
            </productSet>
            <sellers>
                <seller>
                    <name>ТОО "АСЕМ-2"</name>
                    <tin>123456789021</tin>
                </seller>
            </sellers>
        </v2:invoice>
    </invoiceSet>
</esf:invoiceContainer>`

export async function GET(req: NextRequest) {
  return NextResponse.json({ sampleXml: SAMPLE_INVOICE_XML })
}
```

- [ ] **Step 3: Build the diagnostic page**

```typescript
// src/app/profile/esf-spike/page.tsx
'use client'
import { useState } from 'react'
import { runSigexQrSigning } from '@/lib/signDocument' // confirm this import path/name against Step 1's findings before running

export default function EsfSpikePage() {
  const [qr, setQr] = useState<string | null>(null)
  const [egovLink, setEgovLink] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setError(null)
    setSignature(null)
    try {
      const res = await fetch('/api/esf/spike-sign')
      const { sampleXml } = await res.json()
      const blob = new Blob([sampleXml], { type: 'application/xml' })
      const sig = await runSigexQrSigning('ЭСФ-спайк: тест подписи', blob, (qrDataUrl, link) => {
        setQr(qrDataUrl)
        setEgovLink(link)
      })
      setSignature(sig)
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      <h1>ЭСФ: проверка подписи ГОСТ</h1>
      <p>Нажмите кнопку, отсканируйте QR в eGov mobile. <b>Когда приложение попросит выбрать сертификат — обратите внимание, есть ли среди вариантов сертификат ГОСТ (не только RSA/аутентификация).</b> Подпишите ГОСТ-сертификатом, если он предложен.</p>
      <button onClick={start}>Начать подписание</button>
      {qr && <img src={qr} alt="QR" style={{ marginTop: 16, width: 240 }} />}
      {egovLink && <p><a href={egovLink}>Открыть в eGov mobile (если сканируете с того же телефона)</a></p>}
      {signature && <p style={{ wordBreak: 'break-all' }}>Подпись получена ({signature.length} байт base64): {signature.slice(0, 80)}...</p>}
      {error && <p style={{ color: 'red' }}>Ошибка: {error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Gate the page to admin-only**

Read how an existing admin-only page in this codebase enforces that (e.g. `/kaspi-shop/admin-stats` or similar — grep for `is_admin` checks in a page component) and apply the same pattern here, so this diagnostic never becomes reachable by a real customer.

- [ ] **Step 5: Run the live test with the founder**

Deploy, then ask the founder to open `/profile/esf-spike` on his phone or scan the QR with his phone, and report back:
1. Did eGov mobile show a certificate **selection** step at all, or did it just use one certificate automatically?
2. If it showed a choice, did any of the listed certificates indicate GOST specifically (Kazakhstan eGov mobile typically labels a certificate's purpose/type on the selection screen)?
3. Did signing complete without error, and did the page show a returned signature?

- [x] **Step 6: Record the outcome and decide**

> **Spike result (confirmed 2026-09-12):** eGov mobile signed immediately with no certificate-choice screen (only one certificate was available on the founder's device), so the choice couldn't be observed visually. Decoded the returned CMS signature with OpenSSL instead: the embedded signing certificate's issuer is `ҰЛТТЫҚ КУӘЛАНДЫРУШЫ ОРТАЛЫҚ (GOST) 2022` (Kazakhstan's national GOST-branch CA), its signature algorithm OID is `1.2.398.3.10.1.1.2.3.2` (Kazakhstan's own national PKI arc, `1.2.398`, not the RSA/PKCS arc `1.2.840.113549`), and its public key algorithm OID (`1.2.398.3.10.1.1.2.2`) is the corresponding GOST key type. **Confirmed: `runSigexQrSigning` produces a genuine GOST-algorithm signature with no modification needed.** Task 5 reuses it unmodified.

- [x] **Step 7: Remove the diagnostic route and page**

```bash
git rm src/app/api/esf/spike-sign/route.ts
git rm src/app/profile/esf-spike/page.tsx
git commit -m "chore(esf): remove signing spike diagnostic after verifying GOST support"
```

---

## Task 2: Database tables `esf_connections` and `esf_submissions`

**Files:** none in the repo — applied directly against the live Supabase project (`terjitbqgrjlqezyydql`), per this repo's established convention.

**Interfaces:**
- Produces: the two table shapes below, which Task 4 (`esfConnection.ts`) and Task 7 (submit route) read/write directly. Column names here are final — later tasks must match them exactly.

- [ ] **Step 1: Apply the migration via the Supabase MCP tool**

Run this SQL via `mcp__claude_ai_Supabase__execute_sql` (or `apply_migration`) against project `terjitbqgrjlqezyydql`:

```sql
create table esf_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  login text not null,
  password_enc text not null,
  vat_certificate_num text,
  vat_certificate_series text,
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table esf_submissions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('accepted', 'declined')),
  esf_registration_id text,
  esf_num text,
  error_code text,
  error_description text,
  invoice_xml_snapshot text not null,
  submitted_at timestamptz not null default now()
);

create index esf_submissions_invoice_id_idx on esf_submissions(invoice_id);
```

No RLS policies are added — mirrors `kaspi_connections` (zero client RLS policies, service-role only access, per the earlier investigation report). All reads/writes go through server-side routes using the service-role Supabase client, never a browser-side client.

- [ ] **Step 2: Verify the tables exist**

Run via the Supabase MCP tool: `select table_name from information_schema.tables where table_name in ('esf_connections', 'esf_submissions');` — expect both rows back.

- [ ] **Step 3: Generate a new encryption key and add it to Vercel**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output to Vercel as `ESF_SESSION_ENCRYPTION_KEY` (Production + Preview, same environments as `KASPI_SESSION_ENCRYPTION_KEY`) via the Vercel dashboard (the `vercel env` CLI add/rm path is blocked by this session's auto-mode classifier for production secrets — do this step in the dashboard, same as the Halyk secret rotation earlier this session). Redeploy after adding it, same as any other new env var in this project.

---

## Task 3: `canEsf` Pro-gate

**Files:**
- Modify: `src/lib/plan.ts`
- Modify: `src/lib/plan.test.ts`

**Interfaces:**
- Produces: `PlanInfo.canEsf: boolean`, consumed by Task 8 (connection UI) and Task 9 (submit route) exactly the way `canAcquiring` is already consumed elsewhere in this codebase.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/plan.test.ts`:

```typescript
  it('grants canEsf only on an active pro plan', () => {
    expect(getActivePlan({ plan: 'pro' }).canEsf).toBe(true)
    expect(getActivePlan({ plan: 'basic' }).canEsf).toBe(false)
    expect(getActivePlan({}).canEsf).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- plan.test.ts`
Expected: FAIL — `canEsf` is `undefined`, not `true`/`false`.

- [ ] **Step 3: Add `canEsf` everywhere `canAcquiring` appears in `plan.ts`**

In `src/lib/plan.ts`, add `canEsf: boolean` to the `PlanInfo` interface (line 13, right after `canAcquiring: boolean`), then add `canEsf: profile.plan === 'pro',` immediately after every `canAcquiring: profile.plan === 'pro',` line (lines 42 and 59), and `canEsf: false,` immediately after every bare `canAcquiring: false` occurrence (the no-profile branch, the bonus branch, the trial branch, and the free-fallback branch — four call sites in total, lines 25, 76, 91, 101 as currently numbered).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- plan.test.ts`
Expected: PASS, all tests including the new one.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: no type errors, all tests pass (this touches a widely-used shared type, so the full suite must run clean, not just the one test file).

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan.ts src/lib/plan.test.ts
git commit -m "feat(esf): add canEsf Pro-gate to plan.ts"
```

---

## Task 4: `esfConnection.ts` — encrypted credential storage and loader

**Files:**
- Create: `src/lib/esfXml/connection.ts`
- Create: `src/lib/esfXml/connection.test.ts`

**Interfaces:**
- Consumes: `encryptAtRest`/`decryptAtRest` from `src/lib/kaspiPay/crypto.ts` (existing, exact signatures: `encryptAtRest(plaintext: string | Buffer, keyHex: string): string`, `decryptAtRest(ciphertextB64: string, keyHex: string): Buffer`).
- Produces: `EsfConnection` type (`{ userId: string, login: string, password: string, vatCertificateNum: string | null, vatCertificateSeries: string | null }`), `loadEsfConnectionByUserId(userId: string): Promise<EsfConnection | null>`, `saveEsfConnection(userId: string, login: string, password: string, vatCertificateNum: string | null, vatCertificateSeries: string | null): Promise<void>`, `EsfConnectionSecretsError` class — all consumed by Task 8 (UI/route) and Task 7 (submit route).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/esfXml/connection.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()
const mockUpsert = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockSingle }) }),
      upsert: mockUpsert,
    }),
  }),
}))

import { loadEsfConnectionByUserId, EsfConnectionSecretsError } from './connection'

describe('loadEsfConnectionByUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ESF_SESSION_ENCRYPTION_KEY = 'a'.repeat(64) // 32 bytes hex, valid AES-256 key for tests
  })

  it('returns null when no connection row exists', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null })
    const result = await loadEsfConnectionByUserId('user-1')
    expect(result).toBeNull()
  })

  it('throws on a real query error rather than treating it as "no connection"', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    await expect(loadEsfConnectionByUserId('user-1')).rejects.toThrow('connection refused')
  })

  it('throws EsfConnectionSecretsError when the stored ciphertext cannot be decrypted', async () => {
    mockSingle.mockResolvedValue({
      data: { user_id: 'user-1', login: '123456789021', password_enc: 'not-valid-ciphertext', vat_certificate_num: null, vat_certificate_series: null },
      error: null,
    })
    await expect(loadEsfConnectionByUserId('user-1')).rejects.toThrow(EsfConnectionSecretsError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/esfXml/connection.test.ts`
Expected: FAIL with "Cannot find module './connection'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/esfXml/connection.ts
import { createClient } from '@supabase/supabase-js'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mirrors KaspiConnectionSecretsError (src/lib/kaspiPay/connection.ts) --
// same reasoning: AES-256-GCM's auth tag makes a bad ciphertext
// unambiguous, and no retry fixes it, so this is terminal for the one
// connection rather than silently treated as "not connected".
export class EsfConnectionSecretsError extends Error {}

export interface EsfConnection {
  userId: string
  login: string
  password: string
  vatCertificateNum: string | null
  vatCertificateSeries: string | null
}

function toConnection(row: any): EsfConnection {
  const key = process.env.ESF_SESSION_ENCRYPTION_KEY
  if (!key) throw new Error('ESF_SESSION_ENCRYPTION_KEY is not configured')
  try {
    return {
      userId: row.user_id,
      login: row.login,
      password: decryptAtRest(row.password_enc, key).toString('utf8'),
      vatCertificateNum: row.vat_certificate_num,
      vatCertificateSeries: row.vat_certificate_series,
    }
  } catch (e: any) {
    throw new EsfConnectionSecretsError(`esf_connections for user ${row.user_id} could not be decrypted: ${e.message}`)
  }
}

export async function loadEsfConnectionByUserId(userId: string): Promise<EsfConnection | null> {
  const { data, error } = await supabase
    .from('esf_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`esf_connections lookup by user_id failed: ${error.message}`)
  return data ? toConnection(data) : null
}

export async function saveEsfConnection(
  userId: string,
  login: string,
  password: string,
  vatCertificateNum: string | null,
  vatCertificateSeries: string | null
): Promise<void> {
  const key = process.env.ESF_SESSION_ENCRYPTION_KEY
  if (!key) throw new Error('ESF_SESSION_ENCRYPTION_KEY is not configured')
  const { error } = await supabase.from('esf_connections').upsert({
    user_id: userId,
    login,
    password_enc: encryptAtRest(password, key),
    vat_certificate_num: vatCertificateNum,
    vat_certificate_series: vatCertificateSeries,
    status: 'active',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw new Error(`esf_connections upsert failed: ${error.message}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/esfXml/connection.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/esfXml/connection.ts src/lib/esfXml/connection.test.ts
git commit -m "feat(esf): add encrypted esf_connections storage and loader"
```

---

## Task 5: `buildInvoiceXml` — serialize an invoice to `InvoiceV2` XML

**Files:**
- Create: `src/lib/esfXml/buildInvoiceXml.ts`
- Create: `src/lib/esfXml/buildInvoiceXml.test.ts`

**Interfaces:**
- Consumes: an `EsfInvoiceInput` shape assembled by Task 9's route (not the raw `invoices` row directly — the route does the mapping so this function stays a pure, easily-testable string builder with no DB/network access).
- Produces: `buildInvoiceXml(input: EsfInvoiceInput): string` (the raw XML document, ready to sign and submit), consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/esfXml/buildInvoiceXml.test.ts
import { describe, it, expect } from 'vitest'
import { buildInvoiceXml, EsfInvoiceInput } from './buildInvoiceXml'

const SAMPLE_INPUT: EsfInvoiceInput = {
  num: '1',
  date: '12.09.2026',
  turnoverDate: '12.09.2026',
  operatorFullname: 'Абильбаев Алихан',
  seller: {
    name: 'ИП First Project',
    tin: '890525350143',
    address: 'г. Астана',
    bank: 'АО Kaspi Bank',
    bik: 'CASPKZKA',
    iik: 'KZ00000000000000000',
    kbe: '19',
    vatCertificateNum: '1234567',
    vatCertificateSeries: '12345',
  },
  customer: {
    name: 'ТОО Ромашка',
    tin: '123456789012',
    address: 'г. Алматы',
    countryCode: 'KZ',
  },
  lines: [
    { description: 'Консультационные услуги', quantity: 1, unitPrice: 10000, unitCode: '3004200002', unitNomenclature: '796', ndsRate: 12 },
  ],
}

describe('buildInvoiceXml', () => {
  it('produces well-formed XML with the required root elements', () => {
    const xml = buildInvoiceXml(SAMPLE_INPUT)
    expect(xml).toContain('<esf:invoiceContainer xmlns:esf="esf">')
    expect(xml).toContain('<invoiceType>ORDINARY_INVOICE</invoiceType>')
    expect(xml).toContain('<num>1</num>')
  })

  it('computes per-line NDS amount from price and rate, rounded to 2 decimals', () => {
    const xml = buildInvoiceXml(SAMPLE_INPUT)
    // 10000 at 12% NDS-inclusive-in-total pricing: price without tax = 10000,
    // NDS = 10000 * 0.12 = 1200.00, price with tax = 11200.00
    expect(xml).toContain('<priceWithoutTax>10000.00</priceWithoutTax>')
    expect(xml).toContain('<ndsAmount>1200.00</ndsAmount>')
    expect(xml).toContain('<priceWithTax>11200.00</priceWithTax>')
  })

  it('sums line totals into the productSet totals', () => {
    const xml = buildInvoiceXml(SAMPLE_INPUT)
    expect(xml).toContain('<totalPriceWithoutTax>10000.00</totalPriceWithoutTax>')
    expect(xml).toContain('<totalNdsAmount>1200.00</totalNdsAmount>')
    expect(xml).toContain('<totalPriceWithTax>11200.00</totalPriceWithTax>')
    expect(xml).toContain('<totalExciseAmount>0.00</totalExciseAmount>')
  })

  it('escapes XML special characters in free-text fields', () => {
    const input: EsfInvoiceInput = {
      ...SAMPLE_INPUT,
      customer: { ...SAMPLE_INPUT.customer, name: 'ТОО "Ромашка & Ко"' },
    }
    const xml = buildInvoiceXml(input)
    expect(xml).toContain('ТОО &quot;Ромашка &amp; Ко&quot;')
    expect(xml).not.toContain('ТОО "Ромашка & Ко"')
  })

  it('always sets catalogTruId to "1", matching the government reference sample', () => {
    const xml = buildInvoiceXml(SAMPLE_INPUT)
    expect(xml).toContain('<catalogTruId>1</catalogTruId>')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/esfXml/buildInvoiceXml.test.ts`
Expected: FAIL with "Cannot find module './buildInvoiceXml'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/esfXml/buildInvoiceXml.ts

export interface EsfInvoiceInput {
  num: string // digits only, 1-30 chars per InvoiceV2.xsd's num pattern
  date: string // DD.MM.YYYY
  turnoverDate: string // DD.MM.YYYY
  operatorFullname: string
  seller: {
    name: string
    tin: string
    address?: string
    bank?: string
    bik?: string
    iik?: string
    kbe?: string
    vatCertificateNum?: string | null
    vatCertificateSeries?: string | null
  }
  customer: {
    name: string
    tin: string
    address?: string
    countryCode: string
  }
  lines: Array<{
    description: string
    quantity: number
    unitPrice: number // price WITHOUT tax, per unit
    unitCode: string
    unitNomenclature: string
    ndsRate: number // 0-100, integer
  }>
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function money(n: number): string {
  return n.toFixed(2)
}

function buildLine(line: EsfInvoiceInput['lines'][number]) {
  const priceWithoutTax = line.quantity * line.unitPrice
  const ndsAmount = priceWithoutTax * (line.ndsRate / 100)
  const priceWithTax = priceWithoutTax + ndsAmount
  return {
    xml: `
                    <product>
                        <catalogTruId>1</catalogTruId>
                        <description>${escapeXml(line.description)}</description>
                        <ndsAmount>${money(ndsAmount)}</ndsAmount>
                        <ndsRate>${line.ndsRate}</ndsRate>
                        <priceWithTax>${money(priceWithTax)}</priceWithTax>
                        <priceWithoutTax>${money(priceWithoutTax)}</priceWithoutTax>
                        <quantity>${line.quantity}</quantity>
                        <turnoverSize>${money(priceWithoutTax)}</turnoverSize>
                        <unitCode>${escapeXml(line.unitCode)}</unitCode>
                        <unitNomenclature>${escapeXml(line.unitNomenclature)}</unitNomenclature>
                        <unitPrice>${money(line.unitPrice)}</unitPrice>
                    </product>`,
    priceWithoutTax,
    ndsAmount,
    priceWithTax,
  }
}

export function buildInvoiceXml(input: EsfInvoiceInput): string {
  const built = input.lines.map(buildLine)
  const totalPriceWithoutTax = built.reduce((sum, b) => sum + b.priceWithoutTax, 0)
  const totalNdsAmount = built.reduce((sum, b) => sum + b.ndsAmount, 0)
  const totalPriceWithTax = built.reduce((sum, b) => sum + b.priceWithTax, 0)

  const sellerFields = [
    input.seller.address ? `<address>${escapeXml(input.seller.address)}</address>` : '',
    input.seller.bank ? `<bank>${escapeXml(input.seller.bank)}</bank>` : '',
    input.seller.bik ? `<bik>${escapeXml(input.seller.bik)}</bik>` : '',
    input.seller.vatCertificateNum ? `<certificateNum>${escapeXml(input.seller.vatCertificateNum)}</certificateNum>` : '',
    input.seller.vatCertificateSeries ? `<certificateSeries>${escapeXml(input.seller.vatCertificateSeries)}</certificateSeries>` : '',
    input.seller.iik ? `<iik>${escapeXml(input.seller.iik)}</iik>` : '',
    input.seller.kbe ? `<kbe>${escapeXml(input.seller.kbe)}</kbe>` : '',
    `<name>${escapeXml(input.seller.name)}</name>`,
    `<tin>${escapeXml(input.seller.tin)}</tin>`,
  ].filter(Boolean).join('\n                    ')

  const customerFields = [
    input.customer.address ? `<address>${escapeXml(input.customer.address)}</address>` : '',
    `<countryCode>${escapeXml(input.customer.countryCode)}</countryCode>`,
    `<name>${escapeXml(input.customer.name)}</name>`,
    `<tin>${escapeXml(input.customer.tin)}</tin>`,
  ].filter(Boolean).join('\n                    ')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<esf:invoiceContainer xmlns:esf="esf">
    <invoiceSet>
        <v2:invoice xmlns:a="abstractInvoice.esf" xmlns:v2="v2.esf">
            <date>${input.date}</date>
            <invoiceType>ORDINARY_INVOICE</invoiceType>
            <num>${escapeXml(input.num)}</num>
            <operatorFullname>${escapeXml(input.operatorFullname)}</operatorFullname>
            <turnoverDate>${input.turnoverDate}</turnoverDate>
            <customers>
                <customer>
                    ${customerFields}
                </customer>
            </customers>
            <productSet>
                <currencyCode>KZT</currencyCode>
                <products>${built.map(b => b.xml).join('')}
                </products>
                <totalExciseAmount>${money(0)}</totalExciseAmount>
                <totalNdsAmount>${money(totalNdsAmount)}</totalNdsAmount>
                <totalPriceWithTax>${money(totalPriceWithTax)}</totalPriceWithTax>
                <totalPriceWithoutTax>${money(totalPriceWithoutTax)}</totalPriceWithoutTax>
                <totalTurnoverSize>${money(totalPriceWithoutTax)}</totalTurnoverSize>
            </productSet>
            <sellers>
                <seller>
                    ${sellerFields}
                </seller>
            </sellers>
        </v2:invoice>
    </invoiceSet>
</esf:invoiceContainer>`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/esfXml/buildInvoiceXml.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/esfXml/buildInvoiceXml.ts src/lib/esfXml/buildInvoiceXml.test.ts
git commit -m "feat(esf): add InvoiceV2 XML builder for the simple invoice case"
```

---

## Task 6: SOAP client — `createSession` and `syncInvoice`

**Files:**
- Create: `src/lib/esfXml/client.ts`
- Create: `src/lib/esfXml/client.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure network client).
- Produces: `createEsfSession(login: string, password: string, authCertificateBase64: string): Promise<string>` (returns `sessionId`), `syncInvoice(sessionId: string, invoiceXml: string, signatureBase64: string, signingCertificateBase64: string): Promise<EsfSyncResult>` where `EsfSyncResult = { accepted: true, registrationId: string, num: string } | { accepted: false, errorCode: string, errorDescription: string }` — consumed by Task 9's submit route.

The SOAP endpoint host is a genuinely open question — the SDK's PDF documentation shows `https://212.154.167.194:9443/esf-web/ws/api1/...` as its own example (likely the actual production host, since government SDKs commonly document the real IP directly), and the sandbox is `test3.esf.kgd.gov.kz:8443` per the same PDF and the KGD webpage. Both are parameterized via environment variables below rather than hardcoded, so switching between them (and correcting either if it turns out wrong once actually called) needs no code change.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/esfXml/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEsfSession, syncInvoice } from './client'

describe('createEsfSession', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    process.env.ESF_SOAP_BASE_URL = 'https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1'
  })

  it('parses sessionId out of a successful SOAP response', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:createSessionResponse xmlns:esf="esf"><sessionId>abc-123</sessionId></esf:createSessionResponse></soap:Body>
      </soap:Envelope>`,
    })
    const sessionId = await createEsfSession('123456789021', 'pass', 'BASE64CERT')
    expect(sessionId).toBe('abc-123')
  })

  it('throws when the SOAP response has no sessionId', async () => {
    (fetch as any).mockResolvedValue({ ok: true, text: async () => '<soap:Envelope><soap:Body/></soap:Envelope>' })
    await expect(createEsfSession('123456789021', 'pass', 'BASE64CERT')).rejects.toThrow('sessionId')
  })
})

describe('syncInvoice', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    process.env.ESF_SOAP_BASE_URL = 'https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1'
  })

  it('reports accepted with the registration id and num', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:syncInvoiceResponse xmlns:esf="esf">
          <acceptedSet><standardResponse><id>999</id><num>1</num><date>12.09.2026</date></standardResponse></acceptedSet>
          <declinedSet/>
        </esf:syncInvoiceResponse></soap:Body>
      </soap:Envelope>`,
    })
    const result = await syncInvoice('session-1', '<invoice/>', 'SIGBASE64', 'CERTBASE64')
    expect(result).toEqual({ accepted: true, registrationId: '999', num: '1' })
  })

  it('reports declined with the error code and description', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:syncInvoiceResponse xmlns:esf="esf">
          <acceptedSet/>
          <declinedSet><declinedResponse><num>1</num><errorCode>INVALID_TIN</errorCode><errorDescription>БИН покупателя не найден</errorDescription></declinedResponse></declinedSet>
        </esf:syncInvoiceResponse></soap:Body>
      </soap:Envelope>`,
    })
    const result = await syncInvoice('session-1', '<invoice/>', 'SIGBASE64', 'CERTBASE64')
    expect(result).toEqual({ accepted: false, errorCode: 'INVALID_TIN', errorDescription: 'БИН покупателя не найден' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/esfXml/client.test.ts`
Expected: FAIL with "Cannot find module './client'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/esfXml/client.ts

// Both hosts come from the SDK's own PDF documentation
// (esf-sdk-2025.zip, "Документация по API ЭСФ.pdf") -- production is
// shown there as an example IP, sandbox as test3.esf.kgd.gov.kz. Neither
// has been confirmed by an actual successful call yet (Task 10 does
// that) -- kept as env vars specifically so a wrong host is a config
// fix, not a code change.
function baseUrl(): string {
  const url = process.env.ESF_SOAP_BASE_URL
  if (!url) throw new Error('ESF_SOAP_BASE_URL is not configured')
  return url
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`))
  return match ? match[1] : null
}

async function soapCall(service: string, action: string, bodyXml: string, headerXml = ''): Promise<string> {
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:esf="esf">
  <soapenv:Header>${headerXml}</soapenv:Header>
  <soapenv:Body>${bodyXml}</soapenv:Body>
</soapenv:Envelope>`
  const res = await fetch(`${baseUrl()}/${service}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: action },
    body: envelope,
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`ЭСФ SOAP call to ${service} failed: HTTP ${res.status}: ${text.slice(0, 500)}`)
  return text
}

// The government sample request for createSession carries a WS-Security
// UsernameToken header (login as username, the ИС ЭСФ password as
// PasswordText) alongside the body's own tin/x509Certificate -- copied
// verbatim in shape from "Документация по API ЭСФ.pdf" section 3.1.1.
// syncInvoice's own sample shows an EMPTY header (the sessionId returned
// by createSession carries the auth context for every call after), so
// this header is only ever built for createSession, never passed to
// other soapCall() invocations.
function usernameTokenHeader(login: string, password: string): string {
  return `<wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <wsse:UsernameToken>
      <wsse:Username>${login}</wsse:Username>
      <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${password}</wsse:Password>
    </wsse:UsernameToken>
  </wsse:Security>`
}

export async function createEsfSession(login: string, password: string, authCertificateBase64: string): Promise<string> {
  const bodyXml = `<esf:createSessionRequest>
      <tin>${login}</tin>
      <x509Certificate>${authCertificateBase64}</x509Certificate>
    </esf:createSessionRequest>`
  const responseXml = await soapCall('SessionService', 'createSession', bodyXml, usernameTokenHeader(login, password))
  const sessionId = extractTag(responseXml, 'sessionId')
  if (!sessionId) throw new Error(`ЭСФ createSession did not return a sessionId: ${responseXml.slice(0, 500)}`)
  return sessionId
}

export type EsfSyncResult =
  | { accepted: true; registrationId: string; num: string }
  | { accepted: false; errorCode: string; errorDescription: string }

export async function syncInvoice(
  sessionId: string,
  invoiceXml: string,
  signatureBase64: string,
  signingCertificateBase64: string
): Promise<EsfSyncResult> {
  const bodyXml = `<esf:syncInvoiceRequest>
      <sessionId>${sessionId}</sessionId>
      <invoiceUploadInfoList>
        <invoiceUploadInfo>
          <invoiceBody><![CDATA[${invoiceXml}]]></invoiceBody>
          <version>InvoiceV2</version>
          <signature>${signatureBase64}</signature>
          <signatureType>COMPANY</signatureType>
        </invoiceUploadInfo>
      </invoiceUploadInfoList>
      <x509Certificate>${signingCertificateBase64}</x509Certificate>
    </esf:syncInvoiceRequest>`
  const responseXml = await soapCall('UploadInvoiceService', 'syncInvoice', bodyXml)

  const acceptedMatch = responseXml.match(/<acceptedSet>[\s\S]*?<standardResponse>[\s\S]*?<\/standardResponse>[\s\S]*?<\/acceptedSet>/)
  if (acceptedMatch) {
    const registrationId = extractTag(acceptedMatch[0], 'id')
    const num = extractTag(acceptedMatch[0], 'num')
    if (registrationId && num) return { accepted: true, registrationId, num }
  }

  const declinedMatch = responseXml.match(/<declinedSet>[\s\S]*?<declinedResponse>[\s\S]*?<\/declinedResponse>[\s\S]*?<\/declinedSet>/)
  if (declinedMatch) {
    const errorCode = extractTag(declinedMatch[0], 'errorCode') || 'UNKNOWN'
    const errorDescription = extractTag(declinedMatch[0], 'errorDescription') || responseXml.slice(0, 500)
    return { accepted: false, errorCode, errorDescription }
  }

  throw new Error(`ЭСФ syncInvoice response matched neither accepted nor declined shape: ${responseXml.slice(0, 500)}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/esfXml/client.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/esfXml/client.ts src/lib/esfXml/client.test.ts
git commit -m "feat(esf): add SOAP client for createSession and syncInvoice"
```

---

## Task 7: Connection settings UI

**Files:**
- Create: `src/app/api/esf/connect/route.ts`
- Modify: `src/app/profile/acquiring/page.tsx` (add an "ЭСФ" card alongside the existing Kaspi/BCC connect UI — read that file first to match its existing card layout/styling exactly rather than inventing a new pattern)

**Interfaces:**
- Consumes: `saveEsfConnection` from Task 4, `getActivePlan` from Task 3.
- Produces: a working `POST /api/esf/connect` endpoint and a visible form, consumed by no later task (this is a leaf feature — Task 9's submit route reads the connection Task 4 already wrote).

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/esf/connect/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { saveEsfConnection } from '@/lib/esfXml/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).maybeSingle()
  if (!getActivePlan(profile).canEsf) return NextResponse.json({ error: 'Требуется тариф Про' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const { login, password, vatCertificateNum, vatCertificateSeries } = body || {}
  if (!login || !password) return NextResponse.json({ error: 'login и password обязательны' }, { status: 400 })

  await saveEsfConnection(user.id, login, password, vatCertificateNum || null, vatCertificateSeries || null)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Add the UI card**

Read `src/app/profile/acquiring/page.tsx` in full first. Add a new card in the same visual pattern as the existing Kaspi/BCC connect cards, with fields for login, password, ИС ЭСФ VAT certificate number, and series, submitting to `POST /api/esf/connect` with the user's session token in the `Authorization` header (match exactly how the existing Kaspi connect form on the same page gets and sends that token — read that code before writing this, since this plan cannot see the exact existing helper name without it).

- [ ] **Step 3: Manual verification**

Run `npm run dev`, log in as an account with `plan = 'pro'`, open `/profile/acquiring`, fill the new ЭСФ card, submit, then confirm via Supabase (`select * from esf_connections where user_id = '<that user's id>'`) that a row exists with an encrypted `password_enc` (not plaintext).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/esf/connect/route.ts src/app/profile/acquiring/page.tsx
git commit -m "feat(esf): add ЭСФ connection settings UI"
```

---

## Task 8: Persist buyer VAT status on the invoice

**Files:**
- Modify: `src/app/create/page.tsx` (the BIN-lookup call site around line 105/938, per the earlier investigation — read the surrounding code first)

**Interfaces:**
- Consumes: `BinLookupResult.isVatPayer` (existing, from `src/lib/binLookup.ts`).
- Produces: a new `is_vat_payer` boolean column on `invoices`, read by Task 9's entry-point gating (only show "Выставить ЭСФ" when true).

- [ ] **Step 1: Add the column**

Run via the Supabase MCP tool:

```sql
alter table invoices add column is_vat_payer boolean;
```

- [ ] **Step 2: Persist it at invoice creation**

Read `src/app/create/page.tsx` around the existing BIN-lookup integration and the invoice insert call site (`:578-594` per the earlier investigation). Add `is_vat_payer: binLookupResult?.isVatPayer ?? null` to the object passed to the `invoices` insert, using whatever the actual local variable holding the BIN-lookup result is named (confirm the exact name by reading the file — do not guess it here).

- [ ] **Step 3: Manual verification**

Create a test invoice for a known VAT-paying BIN (e.g. a large ТОО known to be VAT-registered) through the real `/create` flow, then confirm via Supabase that the resulting `invoices` row has `is_vat_payer = true`.

- [ ] **Step 4: Commit**

```bash
git add src/app/create/page.tsx
git commit -m "feat(esf): persist buyer VAT-payer status on the invoice"
```

---

## Task 9: Submit route and invoice-page entry point

**Files:**
- Create: `src/app/api/esf/submit/route.ts`
- Modify: `src/app/invoice/[id]/page.tsx` (add the "Выставить ЭСФ" button — read the file first to match its existing action-button pattern)

**Interfaces:**
- Consumes: `loadEsfConnectionByUserId` (Task 4), `buildInvoiceXml`/`EsfInvoiceInput` (Task 5), `createEsfSession`/`syncInvoice` (Task 6), `getActivePlan` (Task 3), and whichever signing function Task 1's spike confirmed (`runSigexQrSigning` from `src/lib/signDocument.ts`, assumed reusable per that task's expected outcome).
- Produces: `POST /api/esf/submit` — the end-to-end feature. Nothing later depends on this task; it is the plan's final integration point.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/esf/submit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { loadEsfConnectionByUserId } from '@/lib/esfXml/connection'
import { buildInvoiceXml, EsfInvoiceInput } from '@/lib/esfXml/buildInvoiceXml'
import { createEsfSession, syncInvoice } from '@/lib/esfXml/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at, bonus_expires_at, trial_expires_at, bin_iin, company_name, legal_address, bank_name, bik, iik, kbe').eq('id', user.id).maybeSingle()
  if (!getActivePlan(profile).canEsf) return NextResponse.json({ error: 'Требуется тариф Про' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const invoiceId = body?.invoiceId
  const authCertificateBase64 = body?.authCertificateBase64
  const signingCertificateBase64 = body?.signingCertificateBase64
  const signatureBase64 = body?.signatureBase64
  const lines = body?.lines // Array<{ description, quantity, unitPrice, unitCode, unitNomenclature, ndsRate }>, entered on the entry-point form since the base invoice's `services` shape doesn't carry per-line VAT/unit yet
  if (!invoiceId || !authCertificateBase64 || !signingCertificateBase64 || !signatureBase64 || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'invoiceId, authCertificateBase64, signingCertificateBase64, signatureBase64, lines обязательны' }, { status: 400 })
  }

  const connection = await loadEsfConnectionByUserId(user.id)
  if (!connection) return NextResponse.json({ error: 'ЭСФ не подключён' }, { status: 400 })

  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', invoiceId).eq('user_id', user.id).maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'Счёт не найден' }, { status: 404 })
  if (!invoice.is_vat_payer) return NextResponse.json({ error: 'Покупатель не отмечен как плательщик НДС' }, { status: 400 })

  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`

  const input: EsfInvoiceInput = {
    num: String(invoice.number).replace(/\D/g, '') || '1',
    date: dateStr,
    turnoverDate: dateStr,
    operatorFullname: profile?.company_name || 'invoices.kz',
    seller: {
      name: profile?.company_name || '',
      tin: profile?.bin_iin || '',
      address: profile?.legal_address || undefined,
      bank: profile?.bank_name || undefined,
      bik: profile?.bik || undefined,
      iik: profile?.iik || undefined,
      kbe: profile?.kbe || undefined,
      vatCertificateNum: connection.vatCertificateNum,
      vatCertificateSeries: connection.vatCertificateSeries,
    },
    customer: {
      name: invoice.client_name || '',
      tin: invoice.client_bin || '',
      address: invoice.client_address || undefined,
      countryCode: 'KZ',
    },
    lines,
  }

  const invoiceXml = buildInvoiceXml(input)

  let result
  try {
    const sessionId = await createEsfSession(connection.login, connection.password, authCertificateBase64)
    result = await syncInvoice(sessionId, invoiceXml, signatureBase64, signingCertificateBase64)
  } catch (e: any) {
    await supabase.from('esf_submissions').insert({
      invoice_id: invoiceId, user_id: user.id, status: 'declined',
      error_code: 'TRANSPORT_ERROR', error_description: e?.message || String(e),
      invoice_xml_snapshot: invoiceXml,
    })
    return NextResponse.json({ error: 'Ошибка связи с ИС ЭСФ: ' + (e?.message || String(e)) }, { status: 502 })
  }

  if (result.accepted) {
    await supabase.from('esf_submissions').insert({
      invoice_id: invoiceId, user_id: user.id, status: 'accepted',
      esf_registration_id: result.registrationId, esf_num: result.num,
      invoice_xml_snapshot: invoiceXml,
    })
    return NextResponse.json({ ok: true, registrationId: result.registrationId })
  }

  await supabase.from('esf_submissions').insert({
    invoice_id: invoiceId, user_id: user.id, status: 'declined',
    error_code: result.errorCode, error_description: result.errorDescription,
    invoice_xml_snapshot: invoiceXml,
  })
  return NextResponse.json({ error: result.errorDescription, errorCode: result.errorCode }, { status: 422 })
}
```

**Note on `authCertificateBase64`/`signingCertificateBase64`:** these come from the merchant's own certificate files, which they must upload or select somewhere in the flow — this route intentionally does not store them (they're read fresh from the request each submission, not persisted, since a certificate rotates independently of the login/password already stored in `esf_connections`). The actual UI for obtaining these two base64 certificate strings from the merchant's browser (a file picker reading a `.p12`/`.cer` file, or extracting the public cert from the SIGEX signing ceremony's own certificate-selection step) is a real UI decision this plan does not resolve — it depends on what Task 1's live spike revealed about how `runSigexQrSigning` exposes the signer's certificate, if at all. Confirm this against Task 1's actual findings before writing the entry-point form in Step 2 below; do not guess it.

- [ ] **Step 2: Add the invoice-page entry point**

Read `src/app/invoice/[id]/page.tsx` in full. Add a "Выставить ЭСФ" button, visible only when the loaded invoice's `is_vat_payer` is `true` and the current user's plan has `canEsf`. Clicking it should open a form collecting each line's `unitCode`/`unitNomenclature` (offer the small fixed set below as a dropdown, since the full government classifier is out of scope per this plan's Global Constraints) and `ndsRate`, run the signing ceremony (per Task 1's confirmed mechanism) over the built XML, and POST to `/api/esf/submit`:

```typescript
// Common ОКЕИ unit codes -- confirmed against the SDK's own "796" example
// (штука) and standard, widely-documented ОКЕИ values. Expand from the
// full classifier (esf-sdk-2025.zip's "Классификатор Ед Изм ИС ЭСФ_211218.xlsx")
// if a merchant needs a unit not listed here -- out of scope for the simple case.
const COMMON_UNIT_CODES = [
  { code: '796', label: 'Штука' },
  { code: '166', label: 'Килограмм' },
  { code: '112', label: 'Литр' },
  { code: '006', label: 'Метр' },
  { code: '055', label: 'Метр квадратный' },
  { code: '113', label: 'Метр кубический' },
  { code: '163', label: 'Грамм' },
  { code: '736', label: 'Упаковка' },
]
```

- [ ] **Step 3: Manual verification against the sandbox**

Deferred to Task 10 below, which exercises this exact route end-to-end.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/esf/submit/route.ts src/app/invoice/[id]/page.tsx
git commit -m "feat(esf): add submit route and invoice-page entry point"
```

---

## Task 10: End-to-end sandbox verification

**Files:** none created — this is a verification task using the tables/routes from every earlier task.

- [ ] **Step 1: Set the sandbox environment variable**

Add `ESF_SOAP_BASE_URL=https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1` to `.env.local` (and Vercel Preview, not Production — this is sandbox-only).

- [ ] **Step 2: Load the SDK's bundled test certificates**

The zip already downloaded to `esf-sdk-2025.zip` contains matching seller test certificates at `Документация ЭСФ SDK/sdk/localserver/AUTH_RSA256_SELLER_NEW.p12` (auth) and `Документация ЭСФ SDK/sdk/localserver/GOSTKNCA_SELLER_NEW.p12` (signing). Extract the public certificate (not the private key) from each `.p12` as base64-encoded DER, e.g.:

```bash
openssl pkcs12 -in AUTH_RSA256_SELLER_NEW.p12 -clcerts -nokeys -passin pass:"" | openssl x509 -outform DER | base64 -w0
```

(Confirm the correct `.p12` password — the SDK's own `logback.xml`/sample source files may state it; if it's genuinely blank, the command above works as shown.)

- [ ] **Step 3: Create a test invoice and connect a test ЭСФ account**

Through the running app (`npm run dev`), create one real invoice for a Pro-plan test account against a customer BIN already known to be a VAT payer (so `is_vat_payer` gets set per Task 8), then use Task 7's connection UI to save a login/password (the SDK's sample requests use `123456789021`/`TestPass123` for the seller side — try these against the sandbox first, since they appear directly in the government's own documentation as if they were real usable sandbox credentials).

- [ ] **Step 4: Submit and observe**

Use the invoice-page entry point (Task 9) to run the full flow: fill line VAT/unit fields, sign via Task 1's confirmed mechanism using a certificate that corresponds to the GOST test cert above (or the founder's own certificate, if Task 1 used that instead), submit.

Expected: either `{ ok: true, registrationId: ... }` (success — record the returned id) or a `422` with a specific `errorCode` from ИС ЭСФ (informative failure — read the description, it will say exactly what's wrong, e.g. an unexpected required field or a validation rule this plan's XML builder didn't account for). A `502` transport error at this step most likely means `ESF_SOAP_BASE_URL` or the SOAP action path in Task 6 don't match the sandbox's real WSDL — re-check `Документация ЭСФ SDK/api-wsdl/UploadInvoiceService.wsdl` and `SessionService.wsdl`'s actual `<soap:address location="...">` values, which this plan's earlier tasks assumed but could not verify by way of a live call at design time.

- [ ] **Step 5: Record the outcome in `esf_submissions`**

Confirm via Supabase that a row was written to `esf_submissions` regardless of outcome, with `invoice_xml_snapshot` containing the real XML that was sent — this is the audit trail this plan promised in its Global Constraints.

- [ ] **Step 6: Report back**

This task's result determines whether the feature is ready for a real (non-sandbox) VAT-paying customer, or whether ИС ЭСФ's sandbox rejected something this plan's XML builder or SOAP client got wrong — in which case, fix it here rather than treating Task 9 as done, then re-run this task.
