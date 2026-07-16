# Company Logo on Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload a company logo once in their profile and have it render on all 4 generated documents (Счёт, АВР, Накладная, КП).

**Architecture:** Add `profiles.logo_url` (mirrors existing `signature_url`/`stamp_url`), a new Supabase Storage bucket `logos` with per-owner-path RLS (stricter than the existing `signatures`/`stamps` buckets), a third upload block on `/profile/signature`, and an optional white logo bar rendered above the navy header in each of the 4 document generators via the existing `resizeToFit()` helper.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + Storage), no new dependencies.

## Global Constraints

- Available on all plans, no `canSign`-style gating (per spec).
- No crop/background-removal UI — plain resize only (per spec).
- Logo always re-encoded to PNG on upload, stored at `logos/{userId}/logo.png` (matches existing `signature.png`/`stamp.png` convention).
- Render size in documents: `resizeToFit(logoUrl, 180, 48)`, left-aligned, white background bar, only rendered when `logo_url` is set.
- This project has no existing unit tests for UI/upload flows (only `plan.test.ts` and `webhookSignature.test.ts` for pure logic) — follow that convention; verification here is via `tsc --noEmit`, `vitest run`, and manual browser check, not new unit tests.

---

### Task 1: Database migration — `logo_url` column + `logos` storage bucket + RLS

**Files:**
- No local file — applied directly via Supabase MCP `apply_migration` (this project has no `supabase/migrations` folder checked into git; schema lives in the dashboard, per existing convention).

**Interfaces:**
- Produces: `public.profiles.logo_url text` column; `storage.buckets` row `logos` (public); RLS policies on `storage.objects` scoped to `bucket_id = 'logos'` allowing SELECT to everyone and INSERT/UPDATE/DELETE only when `(storage.foldername(name))[1] = auth.uid()::text`.

- [ ] **Step 1: Apply the migration**

```sql
alter table public.profiles add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "Logo public read"
on storage.objects for select
using (bucket_id = 'logos');

create policy "Logo owner insert"
on storage.objects for insert
with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Logo owner update"
on storage.objects for update
using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Logo owner delete"
on storage.objects for delete
using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
```

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: terjitbqgrjlqezyydql`, `name: add_logo_url_and_bucket`.

- [ ] **Step 2: Verify**

Run via `mcp__claude_ai_Supabase__execute_sql`:
```sql
select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'logo_url';
select id, public from storage.buckets where id = 'logos';
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'Logo%';
```
Expected: 1 row for `logo_url`, 1 row `logos | true`, 4 policies starting with "Logo".

- [ ] **Step 3: No commit needed** (this task has no local file changes).

---

### Task 2: Upload UI on `/profile/signature`

**Files:**
- Modify: `src/app/profile/signature/page.tsx`

**Interfaces:**
- Consumes: existing `supabase` client import, existing `userId` state, existing page layout conventions (card sections with `bg-white rounded-2xl shadow-sm p-4`).
- Produces: `logoUrl` state (`string | null`), functions `uploadLogo(file: File)` and `removeLogo()`, both operating on the `logos` bucket and `profiles.logo_url`.

- [ ] **Step 1: Add state and load logo_url in `loadData()`**

Change the select in `loadData()`:
```ts
    const { data } = await supabase.from('profiles').select('signature_url, stamp_url, logo_url').eq('id', user.id).single()
    if (data) {
      setSignatureUrl(data.signature_url)
      setStampUrl(data.stamp_url)
      setLogoUrl(data.logo_url)
    }
```
Add near the other `useState` declarations:
```ts
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [savingLogo, setSavingLogo] = useState(false)
```

- [ ] **Step 2: Add `resizeImageToFit` helper + upload/remove functions**

Add this import at the top of the file:
```ts
import { resizeToFit } from '@/lib/imageResize'
```

Add these functions near `removeStamp`:
```ts
  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSavingLogo(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      const resizedDataUrl = await resizeToFit(dataUrl, 500, 200)
      const blob = await (await fetch(resizedDataUrl)).blob()
      const path = `${userId}/logo.png`
      await supabase.storage.from('logos').remove([path])
      const { error } = await supabase.storage.from('logos').upload(path, blob, { upsert: true, contentType: 'image/png' })
      if (error) { alert('Ошибка: ' + error.message); setSavingLogo(false); return }
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('profiles').update({ logo_url: url }).eq('id', userId)
      setLogoUrl(url)
      setSavingLogo(false)
    }
    reader.readAsDataURL(file)
  }

  async function removeLogo() {
    await supabase.storage.from('logos').remove([`${userId}/logo.png`])
    await supabase.from('profiles').update({ logo_url: null }).eq('id', userId)
    setLogoUrl(null)
  }
```

Note: `resizeToFit` (in `src/lib/imageResize.ts`) already accepts any image source string (including a data URL, same as it accepts remote URLs today) and returns a `data:image/png;base64,...` string — confirmed by reading its current implementation, which just does `img.src = url`.

- [ ] **Step 3: Add the UI block**

Insert this block between the "Печать" section and the tip card (`bg-[#1C2056]/5 rounded-2xl p-4` block):
```tsx
        {/* Логотип */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">Логотип компании</div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            {logoUrl ? (
              <div>
                <div className="border rounded-xl p-3 mb-3 bg-gray-50 flex items-center justify-center">
                  <img src={logoUrl} alt="Логотип" className="h-16 object-contain" />
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 border border-[#1C2056] text-[#1C2056] rounded-xl py-2.5 text-sm font-medium text-center cursor-pointer">
                    Заменить
                    <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                  </label>
                  <button onClick={removeLogo}
                    className="flex-1 border border-red-200 text-red-400 rounded-xl py-2.5 text-sm font-medium">
                    Удалить
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">🏢</div>
                <p className="text-sm text-gray-400 mb-4">Логотип появится над шапкой на всех документах</p>
                <label className="bg-[#1C2056] text-white px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer">
                  {savingLogo ? 'Загружаем...' : 'Загрузить логотип'}
                  <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                </label>
              </div>
            )}
          </div>
        </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/profile/signature/page.tsx
git commit -m "add company logo upload to profile signature page"
```

---

### Task 3: Wire `logo_url` through the two `buildProfile`-style callers

**Files:**
- Modify: `src/app/invoice/[id]/page.tsx:95-107` (`buildProfile`)
- Modify: `src/app/dashboard/page.tsx:200-210` (`buildPDFProfile`)

**Interfaces:**
- Consumes: `profile.logo_url` (raw Supabase row field, now present after Task 1).
- Produces: `logo_url` field on the object passed as `profile:` to `generateInvoicePDF`/`generateKP`/`generateAVR`/`generateNakladnaya`.

- [ ] **Step 1: Add `logo_url` to `buildProfile` in `src/app/invoice/[id]/page.tsx`**

```ts
  function buildProfile(withSign: boolean) {
    const ap = getActivePlan(profile)
    return {
      company_name: profile.company_name || '',
      bin_iin: profile.bin_iin || '',
      address: profile.address || '',
      director_name: profile.director_name || '',
      phone: profile.phone || '',
      email: profile.email || '',
      signature_url: withSign && ap.canSign ? (profile.signature_url || '') : '',
      stamp_url: withSign && ap.canSign ? (profile.stamp_url || '') : '',
      logo_url: profile.logo_url || '',
    }
  }
```

- [ ] **Step 2: Add `logo_url` to `buildPDFProfile` in `src/app/dashboard/page.tsx`**

```ts
  function buildPDFProfile() {
    return {
      company_name: profile?.company_name || '',
      bin_iin: profile?.bin_iin || '',
      address: profile?.address || '',
      director_name: profile?.director_name || '',
      phone: profile?.phone || '',
      signature_url: profile?.signature_url || '',
      stamp_url: profile?.stamp_url || '',
      logo_url: profile?.logo_url || '',
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — will show errors until Tasks 4-7 add `logo_url` to each generator's `profile` interface. Expected at this point: errors in `generatePDF.ts`/`generateAVR.ts`/`generateNakladnaya.ts`/`generateKP.ts` about excess property `logo_url` NOT occurring (TS only errors on excess properties for object literals passed directly, and these are literals) — if errors appear, they'll be fixed by Tasks 4-7. Do not commit until Task 7 is done and `tsc` is clean (these three tasks are interdependent — land them together in one commit).

---

### Task 4: Render logo in `generateKP.ts` (navy-header document)

**Files:**
- Modify: `src/lib/generateKP.ts`

**Interfaces:**
- Consumes: `resizeToFit` (already imported in this file per the earlier bugfix), `data.profile.logo_url`.
- Produces: none (leaf rendering change).

- [ ] **Step 1: Add `logo_url` to the `KPData.profile` inline type and read it**

```ts
  profile?: {
    company_name: string
    bin_iin: string
    address: string
    phone?: string
    email?: string
    director_name?: string
    signature_url?: string
    stamp_url?: string
    logo_url?: string
  }
```

Add alongside the other `p?.` reads (near `signatureUrl`/`stampUrl`):
```ts
  const logoUrl = p?.logo_url || ''
```

And alongside the `signatureBase64`/`stampBase64` resize calls:
```ts
  const logoBase64 = logoUrl ? await resizeToFit(logoUrl, 180, 48) : ''
```

- [ ] **Step 2: Insert the logo bar after the toolbar spacer, before the navy header**

Find:
```ts
      <div style="height:55px;"></div>

      <!-- Header -->
      <div class="header">
```
Replace with:
```ts
      <div style="height:55px;"></div>

      ${logoBase64 ? `
      <div style="background:white; padding:12px 40px;">
        <img src="${logoBase64}" style="max-height:48px; max-width:180px; object-fit:contain;" />
      </div>
      ` : ''}

      <!-- Header -->
      <div class="header">
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `generateKP.ts`.

---

### Task 5: Render logo in `generatePDF.ts` (Счёт)

**Files:**
- Modify: `src/lib/generatePDF.ts`

**Interfaces:**
- Consumes: `resizeToFit` (already imported), `data.profile.logo_url`.

- [ ] **Step 1: Add `logo_url` to `ProfileData` interface**

```ts
interface ProfileData {
  company_name: string
  bin_iin: string
  address: string
  director_name: string
  phone?: string
  bank_name?: string
  iik?: string
  bik?: string
  kbe?: string
  signature_url?: string
  stamp_url?: string
  logo_url?: string
}
```

- [ ] **Step 2: Read and resize the logo**

Near the existing `signatureBase64`/`stampBase64` lines:
```ts
  const logoUrl = p?.logo_url || ''
  const logoBase64 = logoUrl ? await resizeToFit(logoUrl, 180, 48) : ''
```

- [ ] **Step 3: Insert the logo bar right after `<body>`, before the `.notice` div**

Find:
```ts
    <body>

      <div class="notice">
```
Replace with:
```ts
    <body>

      ${logoBase64 ? `
      <div style="background:white; padding:10px 16px;">
        <img src="${logoBase64}" style="max-height:48px; max-width:180px; object-fit:contain;" />
      </div>
      ` : ''}

      <div class="notice">
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `generatePDF.ts`.

---

### Task 6: Render logo in `generateAVR.ts` (Форма Р-1)

**Files:**
- Modify: `src/lib/generateAVR.ts`

- [ ] **Step 1: Add `logo_url` to the `AVRData.profile` inline type**

```ts
  profile?: {
    company_name: string
    bin_iin: string
    address: string
    phone?: string
    email?: string
    director_name?: string
    signature_url?: string
    stamp_url?: string
    logo_url?: string
  }
```

- [ ] **Step 2: Read and resize the logo**

Near the existing `signatureBase64`/`stampBase64` lines:
```ts
  const logoUrl = p?.logo_url || ''
  const logoBase64 = logoUrl ? await resizeToFit(logoUrl, 180, 48) : ''
```

- [ ] **Step 3: Insert the logo bar after the toolbar spacer, before the government form header block**

Find:
```ts
      <div style="height:50px;"></div>

      <!-- Шапка справа -->
```
Replace with:
```ts
      <div style="height:50px;"></div>

      ${logoBase64 ? `
      <div style="background:white; padding:10px 16px;">
        <img src="${logoBase64}" style="max-height:48px; max-width:180px; object-fit:contain;" />
      </div>
      ` : ''}

      <!-- Шапка справа -->
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `generateAVR.ts`.

---

### Task 7: Render logo in `generateNakladnaya.ts` (Форма З-2)

**Files:**
- Modify: `src/lib/generateNakladnaya.ts`

- [ ] **Step 1: Add `logo_url` to the `NakladnayaData.profile` inline type**

```ts
  profile?: {
    company_name: string
    bin_iin: string
    address: string
    phone?: string
    email?: string
    director_name?: string
    signature_url?: string
    stamp_url?: string
    logo_url?: string
  }
```

- [ ] **Step 2: Read and resize the logo**

Near the existing signature/stamp base64 reads:
```ts
  const logoUrl = p?.logo_url || ''
  const logoBase64 = logoUrl ? await resizeToFit(logoUrl, 180, 48) : ''
```

- [ ] **Step 3: Insert the logo bar after the toolbar spacer, before the government form header block**

Find:
```ts
<div style="height:44px;"></div>

<!-- Шапка справа -->
```
Replace with:
```ts
<div style="height:44px;"></div>

${logoBase64 ? `
<div style="background:white; padding:10px 16px;">
  <img src="${logoBase64}" style="max-height:48px; max-width:180px; object-fit:contain;" />
</div>
` : ''}

<!-- Шапка справа -->
```

- [ ] **Step 4: Typecheck and commit Tasks 3-7 together**

Run: `npx tsc --noEmit`
Expected: no errors anywhere.

```bash
git add src/app/invoice/[id]/page.tsx src/app/dashboard/page.tsx src/lib/generateKP.ts src/lib/generatePDF.ts src/lib/generateAVR.ts src/lib/generateNakladnaya.ts
git commit -m "render optional company logo bar on all 4 generated documents"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Run existing test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (this feature adds no new unit tests, consistent with this codebase's convention of not unit-testing upload/PDF-generation UI).

- [ ] **Step 3: Manual browser verification (report to user, do not skip)**

1. Log in as a real user, go to `/profile/signature`, upload a logo image in the new "Логотип компании" block. Confirm it appears in the preview and persists after reload.
2. Create/open an invoice (Счёт) and generate its PDF — confirm the logo bar appears above the bank-details table.
3. Generate КП, АВР, and Накладная for the same invoice — confirm the logo bar appears in each (above the navy header for КП, above the official form header for АВР/Накладная).
4. Remove the logo, regenerate one document — confirm the bar disappears and the document looks exactly as before this feature.

