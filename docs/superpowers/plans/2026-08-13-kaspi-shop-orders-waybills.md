# Kaspi Shop: Orders + Waybills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Exception — Task 1 is controller-only, not subagent-dispatchable.** Same reason as the previous plan's Task 1: it needs live interaction with the user's real Kaspi account and the controller's own browser-automation tool access, in real time. Every later task that touches `getOrders` or the waybill endpoint has a **Consumes: Task 1 findings** line — read `docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md` before starting that task and treat its exact shapes as authoritative over anything guessed in this plan.

**Goal:** A read-only Заказы (Orders) view in Kaspi Shop, grouped by status the same way the real Kaspi cabinet groups them, plus combined-waybill printing for orders in "Передача".

**Architecture:** New authenticated calls added to `cabinetApi.ts` (same pattern as `getMerchantInfo`/`listCatalog`) fetch orders live on every page load — no local cache table. A new `waybills.ts` module fetches individual waybill PDFs and merges them with `pdf-lib` (new dependency). The Kaspi Shop page's sidebar, currently showing "Заказы" as a locked "скоро" item, gets a real link to a new `/kaspi-shop/orders` page.

**Tech Stack:** Next.js (dynamic route params are `Promise<{...}>` in this codebase's version), `pdf-lib` for PDF merging, Vitest for the merge logic's test, chrome-devtools-mcp for Task 1's live capture.

## Global Constraints

- No order actions (accept/cancel/mark-packed) in this version — read-only.
- No local order cache/sync table — orders are fetched live from Kaspi on every page load.
- Combined waybills only for orders in "Передача" status.
- Every task ends with a clean `npx tsc --noEmit`; the final task also runs `npm run build` (tsc alone has missed real route-type errors in this codebase before).
- Route handlers and pages have no test coverage in this codebase; only pure-logic modules get colocated Vitest `.test.ts` files.

---

### Task 1: Live capture — real v2 connect end-to-end, `getOrders`, waybill fetch

**Files:**
- Create: `docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a findings document Tasks 2 and 3 read before writing any code.

- [ ] **Step 1: Clear the way for a real v2 connect**

The account currently connected in production went through the old v1 (API-token) flow, so `/kaspi-shop`'s connect form won't show while it's there. Use the Supabase MCP `execute_sql` tool to check the current row (`select id, merchant_id, session_cookies from kaspi_shop_connections`) and delete it (`delete from kaspi_shop_connections where user_id = '{the admin user's id}'`) so the connect form renders again. Note the `merchant_id` value before deleting — the user reconnects with the same one.

- [ ] **Step 2: Drive the real v2 connect flow on the live site**

Navigate to `https://www.invoices.kz/kaspi-shop`. Confirm the phone/merchantId connect form appears (not the "Подключено" dashboard). Ask the user for their phone number and merchant ID, submit, ask for the SMS code when prompted, submit. Record whether the flow completes successfully (UI shows connected + a company name + imported products) or fails, and if it fails, the exact error text shown.

- [ ] **Step 3: Confirm the session actually works**

If Step 2 succeeded, that already proves `cabinetAuth.ts`'s `MC_URL` hop (the previously-unverified piece — see its module comment) produced working `mc-session`/`mc-sid` cookies, since the connect route's catalog import (`listCatalog`) only succeeds with a real working session. Write this outcome plainly into the findings file's first section — this is the answer to a real open question from the previous plan, not just orders-specific research.

- [ ] **Step 4: Capture `getOrders`, live, in the real cabinet**

Navigate to `https://idmc.shop.kaspi.kz/login` (a fresh tab/context, separate from the app's own session) and install the XHR interceptor via `evaluate_script` **before** logging in, exactly as documented in `docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md`:

```js
() => {
  window.__captured = JSON.parse(localStorage.getItem('__kaspi_capture__') || '[]');
  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;
  OrigXHR.prototype.open = function(method, url, ...rest) {
    this.__cap_method = method;
    this.__cap_url = url;
    return origOpen.call(this, method, url, ...rest);
  };
  OrigXHR.prototype.send = function(body) {
    this.__cap_body = body;
    this.addEventListener('loadend', function() {
      try {
        window.__captured.push({
          method: this.__cap_method, url: this.__cap_url,
          body: this.__cap_body ? String(this.__cap_body) : null,
          status: this.status, respBody: this.responseText,
        });
        localStorage.setItem('__kaspi_capture__', JSON.stringify(window.__captured));
      } catch (e) {}
    });
    return origSend.call(this, body);
  };
  return 'installed, existing: ' + window.__captured.length;
}
```

Log in (phone + SMS, ask the user for the code same as Task 2 of the previous plan), then navigate to the Orders section (any status tab — "Новые" is fine even if empty, the query shape is what matters). Before the page navigates away from `idmc.shop.kaspi.kz`/`kaspi.kz`-family origins for any reason, read back `localStorage.getItem('__kaspi_capture__')` on the current origin (if a cross-origin hop happens, navigate back to `idmc.shop.kaspi.kz` afterward to read it, same recovery technique as before). Find the `getOrders` entry and record its full request body (query text + variables) and response body in the findings file.

- [ ] **Step 5: Capture the waybill request for one order in "Передача"**

If a real order in "Передача" status exists on the account, open it and trigger whatever the cabinet's own "накладная" view/print action is, with the same interceptor still active. Record the request method/URL/body and response (note the response `content-type` — this determines whether it's a direct PDF byte stream, a URL to fetch separately, or something else). **If no real order in "Передача" exists on the account**, write that plainly in the findings file as a known gap for Task 3 rather than guessing — Task 3's `fetchWaybillPdf` can be written against a placeholder shape flagged as unconfirmed in that case, same as the previous plan handled `cabinetPricePush.ts` before its shape was known, and confirmed for real the first time a real order reaches that status.

- [ ] **Step 6: Write the findings document and commit**

```bash
git add docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md
git commit -m "docs(kaspi-shop): capture real getOrders/waybill shapes, confirm v2 connect works end-to-end"
```

---

### Task 2: `listOrders` — authenticated orders read

**Files:**
- Modify: `src/lib/kaspiShop/cabinetApi.ts`

**Interfaces:**
- Consumes: **Task 1 findings** for the exact `getOrders` query/variables/response shape. Uses the existing `authHeaders()` helper already in this file.
- Produces: `listOrders(sessionCookies: string, merchantId: string, status: string): Promise<Order[]>` where `Order` carries whatever fields the real response has (at minimum: id, status, customer name, total amount, created timestamp — extend with real field names from the findings file). Task 4's route calls this once per requested status group.

- [ ] **Step 1: Read the findings file**

Read `docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md` in full before writing code. The query text, variables shape, and `Order` type fields below are placeholders for what that file actually contains.

- [ ] **Step 2: Implement**

Add to `src/lib/kaspiShop/cabinetApi.ts`:

```ts
export type Order = {
  id: string
  status: string
  customerName: string
  totalAmount: number
  createdAt: string
}

export async function listOrders(sessionCookies: string, merchantId: string, status: string): Promise<Order[]> {
  const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrders', {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({
      operationName: 'getOrders',
      variables: { merchantId, status },
      query: `query getOrders($merchantId: String!, $status: String!) {
        orders(merchantId: $merchantId, status: $status) {
          id status customerName totalAmount createdAt
        }
      }`,
    }),
  })
  if (!res.ok) return []
  const json = await res.json().catch(() => null)
  return json?.data?.orders ?? []
}
```

Replace the query text, variable names, and `Order` fields with the real shape from the findings file — this is a starting shape only.

- [ ] **Step 3: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiShop/cabinetApi.ts
git commit -m "feat(kaspi-shop): read orders from the authenticated cabinet session"
```

---

### Task 3: Waybill fetch and merge

**Files:**
- Create: `src/lib/kaspiShop/waybills.ts`
- Test: `src/lib/kaspiShop/waybills.test.ts`
- Modify: `package.json` (add `pdf-lib`)

**Interfaces:**
- Consumes: **Task 1 findings** for the exact waybill-fetch request/response shape.
- Produces: `fetchWaybillPdf(sessionCookies: string, orderId: string): Promise<Buffer>` and `mergeWaybillPdfs(pdfBuffers: Buffer[]): Promise<Buffer>`. Task 5's route calls both.

- [ ] **Step 1: Install pdf-lib**

```bash
npm install pdf-lib
```

`jspdf` (already a dependency) builds PDFs from drawing commands and cannot merge pre-existing PDF files — `pdf-lib` can load and recombine real PDF documents, which is what merging Kaspi's own waybill PDFs needs.

- [ ] **Step 2: Write the failing test for the merge logic**

Create `src/lib/kaspiShop/waybills.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { mergeWaybillPdfs } from './waybills'

async function makeTestPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200])
  return Buffer.from(await doc.save())
}

describe('mergeWaybillPdfs', () => {
  it('merges multiple PDFs into one containing all pages, in order', async () => {
    const pdf1 = await makeTestPdf(2)
    const pdf2 = await makeTestPdf(3)
    const merged = await mergeWaybillPdfs([pdf1, pdf2])
    const mergedDoc = await PDFDocument.load(merged)
    expect(mergedDoc.getPageCount()).toBe(5)
  })

  it('returns a valid single-page PDF when given just one', async () => {
    const pdf1 = await makeTestPdf(1)
    const merged = await mergeWaybillPdfs([pdf1])
    const mergedDoc = await PDFDocument.load(merged)
    expect(mergedDoc.getPageCount()).toBe(1)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/kaspiShop/waybills.test.ts`
Expected: FAIL with "Cannot find module './waybills'"

- [ ] **Step 4: Implement**

Read `docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md`'s waybill section before writing `fetchWaybillPdf` -- the URL/method/response-parsing below is a placeholder for what that file actually contains (in particular: confirm from the findings file whether the response IS the PDF bytes directly, or a URL/id needing a second fetch, and adjust accordingly).

Create `src/lib/kaspiShop/waybills.ts`:

```ts
import { PDFDocument } from 'pdf-lib'

// Endpoint/response shape from docs/superpowers/specs/2026-08-13-kaspi-
// orders-api-findings.md -- placeholder until that file's real capture
// confirms it (see the findings file's own note if no real "Передача"
// order existed to test against at capture time).
export async function fetchWaybillPdf(sessionCookies: string, orderId: string): Promise<Buffer> {
  const res = await fetch(`https://mc.shop.kaspi.kz/mc/facade/orders/${encodeURIComponent(orderId)}/waybill`, {
    headers: { 'x-auth-version': '3', 'cookie': sessionCookies, 'origin': 'https://kaspi.kz', 'referer': 'https://kaspi.kz/' },
  })
  if (!res.ok) throw new Error(`Waybill fetch failed for order ${orderId}: HTTP ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// Pure -- no network, no Kaspi-specific assumptions beyond "these are all
// valid PDF byte buffers". Combines every page of every input PDF, in the
// order given, into one PDF.
export async function mergeWaybillPdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create()
  for (const buf of pdfBuffers) {
    const doc = await PDFDocument.load(buf)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }
  return Buffer.from(await merged.save())
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/kaspiShop/waybills.test.ts`
Expected: PASS (both cases) -- this covers `mergeWaybillPdfs` fully; `fetchWaybillPdf` makes a real network call and has no test, matching this codebase's established pattern for network-calling modules.

- [ ] **Step 6: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/kaspiShop/waybills.ts src/lib/kaspiShop/waybills.test.ts
git commit -m "feat(kaspi-shop): fetch and merge order waybill PDFs"
```

---

### Task 4: `GET /api/kaspi-shop/orders`

**Files:**
- Create: `src/app/api/kaspi-shop/orders/route.ts`

**Interfaces:**
- Consumes: `listOrders` (Task 2), `loadConnection` (existing, `src/lib/kaspiShop/connection.ts`).
- Produces: `GET /api/kaspi-shop/orders?status={status}` returning `{ orders: Order[] }`, or `{ error }` with a `session_expired`-flavored message when the session is dead.

- [ ] **Step 1: Extend `KaspiShopConnection` with `sessionCookies`**

`loadConnection`/`loadConnectionById` in `src/lib/kaspiShop/connection.ts` currently decrypt `api_token_enc` but never read or expose `session_cookies`, even though Task 6 of the previous plan already stores it. In `src/lib/kaspiShop/connection.ts`: add `sessionCookies: string | null` to the `KaspiShopConnection` interface, add `session_cookies` to both loaders' `.select(...)` column lists, and set `sessionCookies: data.session_cookies ? decryptAtRest(data.session_cookies, getKey()).toString('utf8') : null` in both returned objects (guarded, since v1 connections have no session cookies at all).

- [ ] **Step 2: Implement the route**

Create `src/app/api/kaspi-shop/orders/route.ts`, following the existing `requireUser` pattern used throughout `src/app/api/kaspi-shop/*`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { listOrders } from '@/lib/kaspiShop/cabinetApi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'NEW'

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  const orders = await listOrders(connection.sessionCookies, connection.merchantId, status)
  return NextResponse.json({ orders })
}
```

- [ ] **Step 3: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kaspi-shop/orders/route.ts src/lib/kaspiShop/connection.ts
git commit -m "feat(kaspi-shop): expose sessionCookies from loadConnection, add GET /api/kaspi-shop/orders"
```

---

### Task 5: `POST /api/kaspi-shop/orders/waybills`

**Files:**
- Create: `src/app/api/kaspi-shop/orders/waybills/route.ts`

**Interfaces:**
- Consumes: `fetchWaybillPdf`, `mergeWaybillPdfs` (Task 3), `loadConnection` (extended in Task 4).
- Produces: `POST /api/kaspi-shop/orders/waybills` with body `{ orderIds: string[] }` returning the merged PDF as `application/pdf` binary, or `{ error }` JSON on failure.

- [ ] **Step 1: Implement**

Create `src/app/api/kaspi-shop/orders/waybills/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { fetchWaybillPdf, mergeWaybillPdfs } from '@/lib/kaspiShop/waybills'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const orderIds: string[] = body?.orderIds
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: 'orderIds обязателен и не должен быть пустым' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const pdfs: Buffer[] = []
  for (const orderId of orderIds) {
    try {
      pdfs.push(await fetchWaybillPdf(connection.sessionCookies, orderId))
    } catch (err: any) {
      return NextResponse.json({ error: `Не удалось получить накладную для заказа ${orderId}: ${err.message}` }, { status: 502 })
    }
  }

  const merged = await mergeWaybillPdfs(pdfs)
  return new NextResponse(merged, {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="nakladnye.pdf"' },
  })
}
```

- [ ] **Step 2: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kaspi-shop/orders/waybills/route.ts
git commit -m "feat(kaspi-shop): merge and download waybills for selected orders"
```

---

### Task 6: Shared sidebar component

**Files:**
- Create: `src/components/kaspiShop/Sidebar.tsx`
- Modify: `src/app/kaspi-shop/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `<KaspiShopSidebar active="demping" | "orders" />` — Task 7's new orders page uses this too, so both pages share one nav definition instead of duplicating it.

- [ ] **Step 1: Extract the sidebar**

Move the `<aside>...</aside>` block currently inline in `src/app/kaspi-shop/page.tsx` (the floating-card sidebar with the Демпинг item and the "скоро" list) into `src/components/kaspiShop/Sidebar.tsx` as its own component, parameterized by an `active: 'demping' | 'orders'` prop. Change the "Заказы" entry from a locked "скоро" `<div>` to a real `<Link href="/kaspi-shop/orders">`, matching the same visual treatment the active Демпинг item already has when `active === 'orders'`. Keep the remaining items (Финансы, Каталог НКТ, Ниши, Предзаказ) as "скоро".

- [ ] **Step 2: Use it from the existing page**

Replace `src/app/kaspi-shop/page.tsx`'s inline `<aside>` block with `<KaspiShopSidebar active="demping" />`.

- [ ] **Step 3: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run `npm run build`, confirm `/kaspi-shop` still renders correctly (no visual regression from the extraction) by comparing against the previous commit's screenshot/behavior mentally -- this is a pure refactor, nothing about its rendered output should change except the "Заказы" item now being a real link.

- [ ] **Step 5: Commit**

```bash
git add src/components/kaspiShop/Sidebar.tsx src/app/kaspi-shop/page.tsx
git commit -m "refactor(kaspi-shop): extract shared sidebar, link the real Заказы page"
```

---

### Task 7: Orders page

**Files:**
- Create: `src/app/kaspi-shop/orders/page.tsx`

**Interfaces:**
- Consumes: `GET /api/kaspi-shop/orders` (Task 4), `POST /api/kaspi-shop/orders/waybills` (Task 5), `<KaspiShopSidebar>` (Task 6).
- Produces: the `/kaspi-shop/orders` page.

- [ ] **Step 1: Implement**

Create `src/app/kaspi-shop/orders/page.tsx`. Status tabs for the full real grouping (`Новые`, `На подписании`, `Самовывоз`, `Моя доставка`, `Kaspi Доставка`, `Предзаказ`, `Упаковка`, `Передача`, `Переданы на доставку`, `Отменены при доставке`, `Архив`, and `Возвраты` as a separate group with its own four sub-tabs: `Новые заявки`, `На доставке`, `Ожидают решения`, `Споры`, `Закрытые заявки`), an order list fetched from `GET /api/kaspi-shop/orders?status={status}` on tab change, and -- only when the active tab is `Передача` -- a checkbox per order plus a "Распечатать все накладные" button that POSTs the selected order IDs to `/api/kaspi-shop/orders/waybills` and triggers a browser download of the returned PDF blob (`const blob = await res.blob(); const url = URL.createObjectURL(blob); ...` triggering a synthetic `<a download>` click, the standard pattern for a binary file response in this codebase's client code).

Same admin-only gate as `src/app/kaspi-shop/page.tsx` (`profiles.is_admin` check, redirect to `/dashboard` otherwise) and the same `authHeader()` Bearer-token pattern for calling the app's own API routes.

- [ ] **Step 2: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/kaspi-shop/orders/page.tsx
git commit -m "feat(kaspi-shop): orders page with status tabs and combined-waybill download"
```

---

### Task 8: Final build verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all pure-logic tests pass, including Task 3's new `waybills.test.ts` suite and every pre-existing suite in this codebase.

- [ ] **Step 2: Full build**

Run: `npx tsc --noEmit` then `npm run build`
Expected: both clean, `/api/kaspi-shop/orders`, `/api/kaspi-shop/orders/waybills`, and `/kaspi-shop/orders` all listed in the build output.

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** live proxy with no cache table (Tasks 2/4 fetch live, no sync job introduced), read-only (no action routes added), status grouping matches the real cabinet (Task 7), combined waybills scoped to "Передача" only (Task 7's UI gates the print button on the active tab) -- all covered.
- **Placeholder scan:** Tasks 2 and 3 contain example query text/endpoint shapes explicitly marked as placeholders pending Task 1's findings file -- a genuine cross-task dependency via the skill's own "Consumes" mechanism, not an unresolved TBD. Every other task has complete, concrete code.
- **Type consistency:** `Order` (Task 2) is the type Task 4's route returns verbatim; `fetchWaybillPdf`/`mergeWaybillPdfs` (Task 3) are the exact names Task 5's route imports; `KaspiShopConnection`'s new `sessionCookies` field (added in Task 4 Step 1) is read directly (`connection.sessionCookies`, no cast) by both Tasks 4 and 5.
