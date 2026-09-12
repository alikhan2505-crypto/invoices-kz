# ЭСФ (электронный счёт-фактура) Integration Design

**Goal:** Let a VAT-paying merchant on invoices.kz issue an official ЭСФ (Kazakhstan's electronic tax invoice, ИС ЭСФ / kgd.gov.kz) directly from an existing platform invoice, instead of re-entering the same data on the government's own web portal.

**Target user:** existing invoices.kz customers who are themselves VAT payers (retention/compliance value for people already on the platform) — not a marketing hook for new signups, and not the founder's own account (he is not confirmed to be a VAT payer). Whether the founder's current VAT-paying customers are already registered ИС ЭСФ participants themselves is unknown and doesn't block building this — it's a rollout question, tracked at the end of this doc.

**Scope for this version:** only the simplest, most common case — `ORDINARY_INVOICE`, standard-rate VAT, regular goods/services. Explicitly out of scope: corrected ЭСФ, return documents, VAT-exempt goods, excisable goods, and any multi-invoice batch upload. Each of those is a real, separate ИС ЭСФ document flow with its own fields; adding them later is a natural follow-up, not a reason to widen this spec now.

## What changed the shape of this design

The government publishes a complete, self-serve SDK with no registration required: `kgd.gov.kz/sites/default/files/ftpdata/ESF/esf-sdk-2025.zip` (189MB — WSDLs, XSD schemas, a full SOAP API reference PDF, sample request/response XML, and bundled **test certificates for both a seller and a buyer** usable against the sandbox at `test3.esf.kgd.gov.kz`). This is a meaningfully different starting position than the Halyk Open API sub-project: **development and testing can start immediately, with no founder action required first.** The founder's involvement is only needed later, to onboard a real VAT-paying customer's real ИС ЭСФ credentials for production rollout.

Reading the actual protocol (`Документация по API ЭСФ.pdf`, `InvoiceV2.xsd`, `UploadInvoiceService.wsdl`) also overturned an assumption from the initial approach discussion: this is **not** a platform-wide relationship like Kaspi Pay or Halyk, where invoices.kz registers once and mediates for every merchant. Each merchant who wants to submit an ЭСФ through us must **already be an independently registered ИС ЭСФ participant** — a taxpayer registers themselves on the ИС ЭСФ portal via their own eGov ID, which issues them a login/password pair and requires them to hold two X.509 certificates (below). invoices.kz's role is to be a nicer front-end over credentials the merchant already holds, not to broker access.

## Protocol, as documented

**Endpoints** (from the SDK's PDF, production host shown as an example — the real prod host and the sandbox host both need confirming against `test3.esf.kgd.gov.kz`'s actual WSDL before going live, but the *shape* below is authoritative, taken directly from the government's own reference doc):
- `SessionService` — `createSession`, `closeSession`, `currentSessionStatus`, `currentUser`.
- `UploadInvoiceService` — `syncInvoice` (the actual submission call).
- `VersionService`, `EsfXsdService` — version/schema introspection, not needed for the simple case.

**Auth model — two separate certificates, not one:**
1. An **AUTH certificate (RSA)** proves identity when opening a session: `createSession` takes a WS-Security `UsernameToken` (login = the taxpayer's TIN/БИН, password = issued at ИС ЭСФ registration) plus the AUTH certificate's public key in the request body, and returns a `sessionId` used for all subsequent calls.
2. A **signing certificate (GOST, not RSA)** signs the actual invoice content: `syncInvoice` sends the invoice XML (`invoiceBody`, CDATA-wrapped), a `signature` (base64, a GOST-algorithm signature over that XML), `signatureType: COMPANY`, and the GOST certificate itself (`x509Certificate`) alongside the `sessionId`.

Confirmed directly from the SDK's bundled test certs, which come in matching RSA/GOST pairs per role (`AUTH_RSA256_SELLER_NEW.p12` + `GOSTKNCA_SELLER_NEW.p12`, and a customer-side equivalent) — this two-certificate split is a real protocol requirement, not a simplification in the sample.

**Submission is synchronous** — `syncInvoiceResponse` immediately returns either `acceptedSet` (with ИС ЭСФ's own registration `id` and `num`) or `declinedSet` (with a reason). No webhook, no polling, no cron sweep needed — a meaningfully simpler settlement story than Kaspi Pay or the planned Halyk integration.

## Open technical risk — verify before writing the full implementation plan

invoices.kz's existing ЭЦП signing (`src/lib/signDocument.ts`, `QRSigningClientCMS` from the `sigex-qr-signing-client` package) has only ever been exercised against **RSA** certificates for contract/invoice PDF signing. ЭСФ's `signature` field specifically requires a **GOST**-algorithm signature. Kazakhstan's eGov/NCALayer ecosystem supports both algorithms natively, and a business ЭЦП typically includes both a RSA and a GOST key pair — but whether the `sigex-qr-signing-client` library lets the signing ceremony target the GOST certificate specifically (vs. defaulting to or only supporting RSA) is **not yet confirmed**. This is the first thing to spike before the rest of the plan is written: sign the SDK's sample XML with the ceremony against a GOST test cert and see whether SIGEX/eGov mobile even offers that certificate as a choice. If it doesn't, ЭСФ signing needs a separate mechanism from the existing contract-signing path — a real scope change, not a detail.

## Architecture

**New table `esf_connections`** (mirrors the shape of `kaspi_connections`, encrypted at rest under a new key): `user_id`, `login` (the taxpayer's ИС ЭСФ login, typically their own TIN), `password_enc`, `auth_certificate_num`/`series` (the metadata `certificateNum`/`certificateSeries` the XML schema itself requires on the seller block — these describe the merchant's own registered ЭЦП certificate, not something invoices.kz issues), `status: active|error|disconnected`. No OAuth — this is credential capture, closer in spirit to Kaspi Pay's connect form than to Halyk's planned OAuth flow.

**New table `esf_submissions`** (audit trail, one row per attempt): `invoice_id`, `user_id`, `esf_registration_id`/`num` (from `acceptedSet`), `status: accepted|declined`, `error_code`/`description` (from `declinedSet` or a transport failure), `submitted_at`, `invoice_xml_snapshot` (the exact bytes that were signed and sent — needed for any future dispute or resubmission, same reasoning as why `document_signatures` keeps a PDF snapshot today).

**New library `src/lib/esfXml/`**:
- `buildInvoiceXml(invoice, profile, buyerVatInfo)` — serializes an existing invoice + seller profile + the already-fetched buyer BIN-lookup VAT data into the `InvoiceV2` XML shape (`esf:invoiceContainer` → `invoiceSet` → `v2:invoice`, one invoice per document for this version — `InvoiceV2.xsd` allows a batch, not needed here).
- `client.ts` — the SOAP calls (`createSession`, `syncInvoice`) against the WSDL endpoints, once confirmed against the real sandbox/production hosts.
- `signInvoiceXml(xmlBytes, connection)` — the GOST signing ceremony, pending the risk above being resolved.

**Data-model additions to the existing invoice creation flow** (`src/app/create/page.tsx` and the `services` line-item shape), needed because ЭСФ requires them and the current model doesn't carry them:
- Per-line VAT rate and amount (`ndsRate`, `ndsAmount`) — today VAT is only a seller-level setting applied to the invoice total. This needs a real UI change to the line-item editor, not just a backend field.
- A unit-of-measure code per line, drawn from the ИС ЭСФ classifier bundled in the SDK (`Классификатор Ед Изм ИС ЭСФ_211218.xlsx`) — import it the same way `kazakhstanBanks.ts` turned a fixed list into a picker, rather than free text.
- Persist the buyer's VAT-payer status on the invoice at the point ЭСФ is issued (today `isVatPayer` from `/api/bin-lookup` is display-only and never written to the `invoices` row).

**Gating:** a new `canEsf` boolean on `PlanInfo` (`src/lib/plan.ts`), Pro-only, checked both client-side (hide the action) and server-side in the new `/api/esf/*` routes (403 if false) — the same two-layer pattern already used for `canEcp`/`canKpAvrNakl`.

**Entry point:** a "Выставить ЭСФ" action on an existing invoice, shown only when that invoice's counterparty was already flagged as a VAT payer during BIN lookup — not a general button on every invoice. Opens a form to fill the gaps above (per-line VAT/unit, ИС ЭСФ login credentials if not yet connected) and runs build → sign → submit.

## Testing

Because the SDK ships real test certificates and a real sandbox host, this can be tested end-to-end without any external dependency: build the sample XML from the SDK's own template, sign it with the bundled GOST test cert (once the signing-risk spike above confirms how), submit to `test3.esf.kgd.gov.kz`, and confirm an `acceptedSet` comes back — before writing a single line of UI. `buildInvoiceXml` gets ordinary unit tests against known invoice fixtures compared to the SDK's sample XML output.

## What happens next

1. **Spike first** (before `writing-plans`): confirm whether `sigex-qr-signing-client` can produce a GOST-algorithm signature. This determines whether the rest of the plan reuses the existing signing ceremony or needs a new one.
2. Once resolved, `writing-plans` produces the task-by-task implementation plan — unlike the Halyk sub-project, this one is NOT blocked on any founder or third-party action; it can go straight to a real plan once the spike above is answered.
3. Before production rollout (not before building): find out whether the founder's actual VAT-paying customers are already registered ИС ЭСФ participants — if none are, the feature has no one to use it yet regardless of how well it's built, and that conversation should happen before investing further past the MVP.
