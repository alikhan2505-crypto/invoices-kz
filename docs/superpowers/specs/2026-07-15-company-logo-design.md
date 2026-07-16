# Company logo on documents

## Problem

Documents (Счёт, АВР, Накладная, КП) currently show only a text company name in the navy header. The user wants to add an optional company logo to make the documents look more authoritative, matching the branding already available for signature/stamp.

## Scope

Logo upload + rendering on all 4 document types: `generatePDF.ts` (Счёт), `generateAVR.ts`, `generateNakladnaya.ts`, `generateKP.ts`.

Available on all plans, including Free.

## Data model

- New column `public.profiles.logo_url text` (nullable), same shape as existing `signature_url`/`stamp_url`.
- New Supabase Storage bucket `logos`, public read, path convention `{user_id}/logo.png` (always re-encoded to PNG on upload, matching signature/stamp).
- Storage RLS for the `logos` bucket is scoped to the owning user's path (`(storage.foldername(name))[1] = auth.uid()::text`) for INSERT/UPDATE/DELETE, and public SELECT — unlike the existing `signatures`/`stamps` bucket policies, which only check `bucket_id` and let any authenticated user overwrite/delete any other user's file. That existing gap is out of scope for this spec (separate fix, flagged to the user, not yet approved).

## UI

New "Логотип компании" block on `/profile/signature` (same page as signature/stamp), same three-state pattern:
- Empty state: "Загрузить логотип" button, file input.
- On select: client-side resize via a canvas (fit into a bounding box, e.g. 500×200, without upscaling smaller images — reusing the just-fixed `resizeToFit` semantics) then upload as PNG, `upsert: true`, to `logos/{userId}/logo.png`, then `profiles.update({ logo_url })`.
- Filled state: preview + "Заменить" / "Удалить" buttons (same as stamp).
- No crop/background-removal step (unlike stamp) — logos are assumed to already be clean images.

## Document rendering

Only `generateKP.ts` (КП) has a navy branded header. `generatePDF.ts` (Счёт), `generateAVR.ts`, and `generateNakladnaya.ts` are all plain black-and-white documents (Счёт follows the traditional Kazakhstan "счёт на оплату" layout with a bank-details table; АВР/Накладная are strict official government form templates — Форма Р-1 / Форма З-2 per Ministry of Finance orders). None of these three have a navy header.

In all 4 generators, if `profile.logo_url` is set, render an additional white bar with the logo, left-aligned, immediately after the toolbar spacer div and before the document's own content:
- For `generateKP.ts`: above the existing navy header.
- For `generatePDF.ts`/`generateAVR.ts`/`generateNakladnaya.ts`: above the document's own content (bank-details table / official form reference block), without altering anything below it.
- `resizeToFit(logoUrl, 180, 48)` (same helper/convention as signature `resizeToFit(url, 200, 60)`).
- If `logo_url` is not set, no bar is rendered — documents look exactly as they do today.
- `generateKP.ts` needs no extra plumbing beyond this — it was already made async and given a `resizeToFit` import as part of the earlier signature/stamp resize bugfix in this session.

## Out of scope

- Cropping/editing UI for the logo (plain resize only).
- Fixing the pre-existing `signatures`/`stamps` bucket RLS gap (flagged separately).
- Any plan-tier gating (available to all plans per user decision).
