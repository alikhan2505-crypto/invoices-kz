# Приём платежей через Kaspi Pay (свой Кассир-API) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 1 and Task 2 must be executed by the session controller directly, not a fresh subagent — they involve reading and porting a third-party reverse-engineered protocol under an explicit, already-negotiated risk acceptance from the user; a subagent starting cold has neither that context nor the same judgment calibration. Do not dispatch Tasks 1–2 to a subagent.**

**Goal:** Replace the paid xpayment.kz dependency with an in-house Kaspi Pay "Кассир" (Cashier) integration: a Pro user connects their own Cashier role (phone + SMS code, same mechanism xpayment/apipay already use), gets a documented public API + token for their own sites/apps, and gets automatic payment links/QR codes on invoices.kz's own invoices with automatic paid-status confirmation.

**Architecture:** A pure crypto module (ECDH device pairing, TOTP/OCRA request codes, AES-256-GCM at-rest encryption, ECDSA request signing) ported from the MIT-licensed `tapter-dev/kaspi-pos-automation` reference implementation, wrapped by a network client that talks to Kaspi's real (undocumented) backend hosts. Each invoices.kz customer's connection is stored encrypted, service-role-only (no client RLS), mirroring the `bcc_connections` posture. A documented public REST endpoint (`POST /api/kaspi/pay`, Bearer customer-token auth) is the one core capability, consumed both externally (customer's own site) and internally (invoices.kz's own invoice-send path). A polling cron (Kaspi's protocol has no real push webhook) detects payment completion and either marks an invoice paid or fires a signed outbound webhook.

**Tech Stack:** Next.js App Router route handlers (Node runtime), Node's built-in `crypto` (ECDH/ECDSA/HMAC/AES-256-GCM — no new npm dependency, matching this codebase's existing minimal-dependency style in `src/lib/webhookSignature.ts`), Supabase JS client (service-role for privileged tables), Resend (not used here — no email in this feature), Vitest.

## Global Constraints

- **This automates Kaspi Pay's Cashier role — not an official, Kaspi-sanctioned API.** The user has explicitly reviewed and accepted this risk twice this session. Every route must log failures clearly (which connection, which step) since Kaspi can change or block this protocol without notice — no silent failure.
- **CRITICAL — per-connection device identity, not a shared one.** The reference project (`tapter-dev/kaspi-pos-automation`) is single-tenant by construction: it generates ONE ECDSA identity keypair (`keypair.json`) and ONE device fingerprint (`deviceId`/`installId`/`pinHash` in `device.json`) **once for the whole deployment**, and reuses that same identity for every phone number ever paired through it. Copying that as-is for a multi-tenant product would make every one of invoices.kz's customers look, to Kaspi's fraud detection, like the exact same physical device pairing dozens of unrelated businesses — a near-certain block. **Every `kaspi_connections` row must generate and persist its OWN identity keypair and device fingerprint at connect time** (Task 1's `generateIdentity()`, Task 4's connect flow) — never a shared, module-level constant. This is the single most important deviation from the reference project's own code shape; do not "simplify" it back to a shared identity.
- **Confirmed real Kaspi backend hosts, endpoints, and request shapes** (read directly from the reference project's live source this session — `crypto.js`, `config.js`, `session.js`, `helpers.js`, `routes/auth.js`, MIT-licensed, ~147 GitHub stars — do not re-derive from generic assumptions):
  - `KASPI_ENTRANCE_URL = https://entrance-pay.kaspi.kz` — SMS pairing flow, three sequential `POST /api/v1/entrance/step` calls sharing one `processId`:
    1. **init** — body `{ data: {}, Data: { auth: '2', appBuild, appVersion, platformVersion, platformType: 'IOS', deviceBrand, deviceModel, deviceId, installId, frontCameraAvailable: 'true', sf: 'registration', pc: 'KPEntrance', noPass: '0' }, actType: 'Success' }`. Response's `meta.pId` is the `processId` for the rest of this flow. A `user_token` may arrive via `Set-Cookie` — capture it (via the `set-cookie` header, regex `user_token=([^;]+)`) and send it back as a `user_token=...` cookie fragment on every subsequent call in this same flow.
    2. **send-phone** — body `{ meta: { pId: processId, sn: 'EnterPhoneNumber' }, data: { phoneNumber }, actType: 'Success' }`. Success is `body.view?.code === 'EnterOtp'`.
    3. **verify-otp** — body `{ meta: { pId: processId, sn: 'ViewEnterOtp' }, data: { userOtp: otp, inputType: 'auto' }, actType: 'Success' }`. Success is `body.data?.type === 'kpDeviceRegistration'` or `body.view?.code === 'KPMobileCall'` — this is what triggers the finish step below.
    - Every one of these three calls shares a base header set: `Accept: application/json, text/plain, */*`, `Content-Type: application/json`, `Accept-Language: ru`, `Accept-Encoding: gzip, deflate, br`, `Origin: <KASPI_ENTRANCE_URL>`, `Sec-Fetch-*` triad, `User-Agent` = a Safari-on-iOS string built from `APP.platformVer` (see below), plus a per-call `Referer` (a `KASPI_ENTRANCE_URL/process/...` URL carrying the device params) and a `Cookie` built from `deviceId`/`installId`/`is_mobile_app=true`/`locale`/`ma_bld`/`ma_platform_type`/`ma_platform_ver`/`ma_ver`/`pk`/`pkTag`/`xs=R:0|E:0|RH:0|N:0` (+ `user_token` once captured).
    - **finish** (called automatically right after a successful verify-otp) — `POST /api/v1/kpentrance/finish`, body `{ signed: { sign, data: signedDataB64 }, guard: { pinHash, x509: ecdhX509 }, processId }` where `signedDataB64` is base64 of `{ installId, time: <ISO with numeric offset>, auth: [{value:'', type:'pincode'}], userIdHash: '' }`, `sign` is that connection's **identity** ECDSA signature (SHA256) over `signedDataB64`, and `ecdhX509` is a **freshly generated, one-time ECDH P-256 public key** (base64 SPKI DER) — this ECDH pair exists only for this one exchange. This request uses a different header set (native-app `User-Agent`, not the browser one) including `X-Time`, `X-Call: notConnected`, `X-Platform-Type`, `X-PkTag`, `X-SU` (md5 of the lowercased URL), `X-Net-Type: WIFI/ETHERNET`, `X-Emulator: 0`, `X-Locale`, `X-SV: 2`, `X-Request-ID` (uppercase UUID), `X-Time-Zone: GMT+05:00`, `X-SH` (a literal comma-joined list naming which headers+`url` participate in the signature, in this exact order: `url,X-Time-Zone,X-Request-ID,X-Net-Type,X-Emulator,X-Call,X-Platform-Type,X-Locale,X-Time,X-SV`), and finally `X-Sign` — computed by concatenating `url.toLowerCase()` and each named header's *current* value (one per line, in `X-SH`'s order) then the raw body, SHA-256 hashing that text, and ECDSA-signing the hash with the connection's identity key. Response: `{ success: true, data: { tokenSN, x509: <Kaspi's own ECDH public key, base64> } }`. Complete the ECDH exchange (`crypto.diffieHellman({privateKey: ourEphemeralPrivateKey, publicKey: theirs})`) — the resulting shared secret **is** this connection's permanent OCRA/TOTP seed (`totp_seed_enc`), never regenerated after this point.
  - `KASPI_MTOKEN_URL = https://mtoken.kaspi.kz` — immediately after `finish` succeeds, `POST /v08/organizations/org-context-otp` (same `X-SH`/`X-Sign` signing scheme as `finish`, this call's `X-SH` order is `url,X-Kb-Client-Ip,X-Time,X-App-Ver,X-SV,X-Locale,X-App-Bld,X-Install-ID,X-Kb-TokenSn,X-S,X-Kb-TokenSnMac,X-Call`) with headers `X-Kb-TokenSn: tokenSN`, `X-Kb-TokenSnMac: <OCRA code from tokenSN+the just-derived shared secret>`, `X-Install-ID`, `X-App-Ver`, `X-App-Bld`, body `{ DeviceInformation: { SdkVersion: 'AOTP service', DeviceId, ApplicationId: 'kz.kaspi.business', ScreenWidth, Model, ScreenHeight, DeviceName, VersionName, BuildRelease: '<platform> <platformVer>', Brand, Board: platformVer, Platform, Product: 'Kaspi Pay', frontCameraAvailable: true, VersionCode: build, InstallId }, OrganizationId: 0 }`. Response's `Data.Current` carries `{ProfileId, OrganizationName, OrganizationId, OrganizationIdn, OrganizationKbe, EmpId, AccessLevelType, IsCashier, ...}` — persist `ProfileId`/`OrganizationId`/`OrganizationIdn`/`OrganizationKbe` on the connection.
  - `KASPI_QRPAY_URL = https://qrpay.kaspi.kz` — payment creation/status, every call authenticated via a signed-header set (`signedQrPayHeaders`): `X-Kb-TokenSn`, `X-Kb-TokenSnMac` (OCRA code, recomputed fresh per request from `tokenSN` + the connection's stored shared secret — this is what makes it a "30-second rolling code", not a static token), `X-PI` (profileId), `X-Install-ID`, `X-Device-ID`, `X-App-Ver`, `X-App-Bld`, `X-Platform-Type`, `X-Platform-Ver`, `X-Locale`, `X-Time`, `X-Request-ID`, `X-Call: notConnected`, `X-SV: 2`, `X-SH` (literal value: `url,X-Install-ID,X-PI,X-App-Bld,X-Platform-Ver,X-Locale,X-App-Ver,X-Device-ID,X-SV,X-Time,X-Platform-Type,X-Call,X-Kb-TokenSnMac,X-Kb-TokenSn`), `X-Sign` (same url+headers+body signing scheme as `finish`, using the connection's identity key), native `User-Agent`:
    - `POST /v01/qr-token/create`, body `{ PaymentAmount, DeviceInterface: 'Pos', Latitude?, Longitude? }` → `{ QrOperationId, QrToken, ExpireDate, ReceiptUrl, Amount, ... }`.
    - `GET /v02/kaspi-qr/status?qrOperationId=...`.
    - `GET /v01/remote/client-info?phoneNumber=...` — looks up a payer by phone before creating a phone-push payment.
    - `POST /v01/remote/create`, body `{ PhoneNumber, Amount, Comment }` → `{ Data: { QrOperationId, Amount, ClientMobile, ReceiptUrl, OrderNumber } }`.
    - `GET /v02/remote/details?operationId=...`.
    - `POST /v01/remote/cancel`, body `{ qrOperationId }`.
  - App/device constants that Kaspi's backend validates (`config.js`'s `APP` object): `version: '4.112.1'`, `build: '1107'`, `platform: 'iOS'`, `platformVer: '18.4'`, `locale: 'ru-RU'`, `model: 'iPhone16,2'`, `brand: 'Apple'`, `deviceName: 'iPhone'`, `screenW: '430.0'`, `screenH: '932.0'`, `cfNetwork: 'CFNetwork/3826.400.120'`, `darwin: 'Darwin/24.4.0'` — these drift as Kaspi updates their real app and the reference project updates to match; **Task 2 re-reads `config.js` fresh** rather than this plan hardcoding values that may already be stale. Native User-Agent: `` `Kaspi%20Pay/${build} ${cfNetwork} ${darwin}` ``. Browser User-Agent: an iOS Safari string built from `platformVer`.
- **Per-customer, non-aggregated** — one `kaspi_connections` row per invoices.kz user (`unique(user_id)`), each holding that customer's *own* paired device identity and session. invoices.kz never receives money on another business's behalf.
- **Pro plan only**, gated by the existing `canAcquiring` flag (`src/lib/plan.ts`) — same umbrella as the BCC-connect feature, no new plan flag.
- **`kaspi_connections` gets zero client-facing RLS policies** (service-role only), same posture as `bcc_connections`. Its secret columns (`identity_private_key_enc`, `totp_seed_enc`) are additionally encrypted at rest with AES-256-GCM (`KASPI_SESSION_ENCRYPTION_KEY`) — stronger than BCC's access-control-only posture, because a leaked Kaspi session is not remotely revocable by us the way a BCC OAuth token is.
- **`kaspi_payment_requests` gets exactly one client-facing policy** (`select`, `auth.uid() = user_id`) — same shape as `bcc_pending_matches`.
- **The public `POST /api/kaspi/pay` endpoint authenticates via a per-customer API token** (Bearer, looked up by `sha256(token) = api_token_hash`), **not** a Supabase session — it's called from the customer's own servers/sites, not a logged-in browser.
- **New env var**: `KASPI_SESSION_ENCRYPTION_KEY` — a 32-byte hex string, `openssl rand -hex 32`, used as the AES-256-GCM key for `kaspi_connections`' secret columns.
- **No repo-tracked migration file** — this codebase has no `supabase/migrations` directory; schema is applied directly via the Supabase MCP tools, same as every other table added this session.
- Full spec: `docs/superpowers/specs/2026-08-01-kaspi-pay-cashier-design.md` — read it if anything below is ambiguous. The design doc predates this plan's device-identity correction; trust this plan's Global Constraints over the design doc's Architecture section where they now differ, and update the design doc's Task 2 reference in a later pass if convenient.

---

### Task 1: Port the reference protocol's crypto layer — `src/lib/kaspiPay/crypto.ts`

**Files:**
- Create: `src/lib/kaspiPay/crypto.ts`
- Test: `src/lib/kaspiPay/crypto.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, Node's built-in `crypto` only).
- Produces: `generateIdentity(): Identity` (a fresh per-connection identity — see Global Constraints' per-connection-identity note), `derivePkAndTag(publicKeyPem: string): { pk: string, pkTag: string }`, `generateEphemeralEcdh(): { privateKey: crypto.KeyObject, publicKeyB64: string }`, `completeEcdh(privateKey: crypto.KeyObject, serverPublicKeyB64: string): Buffer`, `encryptAtRest(plaintext: string | Buffer, keyHex: string): string`, `decryptAtRest(ciphertext: string, keyHex: string): Buffer`, `computeTokenSnMac(tokenSn: string, secret: Buffer): string`, `signPayload(identityPrivateKeyPem: string, dataB64: string): string`, `computeXSU(url: string): string`, `computeXSign(url: string, headers: Record<string,string>, xshOrder: string, body: string, identityPrivateKeyPem: string): string` — all consumed by Task 2's client module. `Identity = { deviceId: string, installId: string, pinHash: string, identityPrivateKeyPem: string, identityPublicKeyPem: string }`.

This is a controller-executed research-and-port task, not a from-spec implementation — fabricating ECDH/ECDSA/OCRA code from a description risks subtle bugs that simply won't interoperate with Kaspi's real backend. The correct source of truth is the reference project's own working code, already read this session (see Global Constraints for the exact confirmed primitives and wire shapes) — re-read `crypto.js` fresh at implementation time if anything below is unclear, since this plan quotes it rather than reproducing it verbatim.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kaspiPay/crypto.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  generateIdentity,
  derivePkAndTag,
  generateEphemeralEcdh,
  completeEcdh,
  encryptAtRest,
  decryptAtRest,
  computeTokenSnMac,
  signPayload,
  computeXSU,
  computeXSign,
} from './crypto'
import crypto from 'crypto'

describe('generateIdentity', () => {
  it('produces a unique identity each call (deviceId, installId, keys all differ)', () => {
    const a = generateIdentity()
    const b = generateIdentity()
    expect(a.deviceId).not.toBe(b.deviceId)
    expect(a.installId).not.toBe(b.installId)
    expect(a.identityPrivateKeyPem).not.toBe(b.identityPrivateKeyPem)
    expect(a.identityPrivateKeyPem).toContain('PRIVATE KEY')
    expect(a.identityPublicKeyPem).toContain('PUBLIC KEY')
    expect(a.pinHash).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('derivePkAndTag', () => {
  it('is deterministic for the same public key', () => {
    const { identityPublicKeyPem } = generateIdentity()
    const first = derivePkAndTag(identityPublicKeyPem)
    const second = derivePkAndTag(identityPublicKeyPem)
    expect(first).toEqual(second)
    expect(first.pkTag).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('generateEphemeralEcdh / completeEcdh', () => {
  it('two parties deriving from each other\'s public key agree on the same secret', () => {
    const a = generateEphemeralEcdh()
    const b = generateEphemeralEcdh()
    const secretFromA = completeEcdh(a.privateKey, b.publicKeyB64)
    const secretFromB = completeEcdh(b.privateKey, a.publicKeyB64)
    expect(secretFromA.equals(secretFromB)).toBe(true)
  })
})

describe('encryptAtRest / decryptAtRest', () => {
  const key = crypto.randomBytes(32).toString('hex')

  it('round-trips a Buffer secret', () => {
    const secret = crypto.randomBytes(32)
    const ciphertext = encryptAtRest(secret, key)
    expect(decryptAtRest(ciphertext, key).equals(secret)).toBe(true)
  })

  it('round-trips a plain string', () => {
    const ciphertext = encryptAtRest('some-pem-or-token', key)
    expect(decryptAtRest(ciphertext, key).toString('utf8')).toBe('some-pem-or-token')
  })

  it('rejects tampered ciphertext (GCM auth tag check)', () => {
    const ciphertext = encryptAtRest('super-secret', key)
    const tampered = ciphertext.slice(0, -2) + (ciphertext.slice(-2) === 'aa' ? 'bb' : 'aa')
    expect(() => decryptAtRest(tampered, key)).toThrow()
  })
})

describe('computeTokenSnMac', () => {
  it('is deterministic within the same 30-second window', () => {
    const secret = crypto.randomBytes(32)
    const code1 = computeTokenSnMac('12345678', secret)
    const code2 = computeTokenSnMac('12345678', secret)
    expect(code1).toBe(code2)
    expect(code1).toMatch(/^\d{6}$/)
  })

  it('differs for a different secret', () => {
    const code1 = computeTokenSnMac('12345678', crypto.randomBytes(32))
    const code2 = computeTokenSnMac('12345678', crypto.randomBytes(32))
    expect(code1).not.toBe(code2)
  })
})

describe('signPayload', () => {
  it('produces a signature verifiable against the matching identity public key', () => {
    const { identityPrivateKeyPem, identityPublicKeyPem } = generateIdentity()
    const dataB64 = Buffer.from(JSON.stringify({ installId: 'x' })).toString('base64')
    const signature = signPayload(identityPrivateKeyPem, dataB64)
    const verify = crypto.createVerify('SHA256')
    verify.update(dataB64)
    expect(verify.verify(identityPublicKeyPem, signature, 'base64')).toBe(true)
  })
})

describe('computeXSU', () => {
  it('is the lowercase md5 of the lowercased url', () => {
    const url = 'https://Entrance-Pay.Kaspi.KZ/api/v1/kpentrance/finish'
    const expected = crypto.createHash('md5').update(url.toLowerCase()).digest('hex')
    expect(computeXSU(url)).toBe(expected)
  })
})

describe('computeXSign', () => {
  it('produces a signature verifiable by reconstructing the same signed text', () => {
    const { identityPrivateKeyPem, identityPublicKeyPem } = generateIdentity()
    const url = 'https://qrpay.kaspi.kz/v01/qr-token/create'
    const headers = { 'X-Time': '2026-01-01T00:00:00.000+0500', 'X-Call': 'notConnected' }
    const xshOrder = 'url,X-Time,X-Call'
    const body = JSON.stringify({ PaymentAmount: 1000 })
    const signature = computeXSign(url, headers, xshOrder, body, identityPrivateKeyPem)

    const signText = `url:${url.toLowerCase()}\nx-time:${headers['X-Time']}\nx-call:${headers['X-Call']}\n${body}`
    const hash = crypto.createHash('sha256').update(signText, 'utf8').digest()
    const verify = crypto.createVerify('SHA256')
    verify.update(hash)
    expect(verify.verify(identityPublicKeyPem, signature, 'base64')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kaspiPay/crypto.test.ts`
Expected: FAIL with "Cannot find module './crypto'".

- [ ] **Step 3: Implement**

Create `src/lib/kaspiPay/crypto.ts`:

```ts
// Protocol ported from tapter-dev/kaspi-pos-automation (MIT license), adapted
// to this codebase's conventions. IMPORTANT DEVIATION from the reference
// project: it generates ONE identity keypair + device fingerprint for its
// whole process lifetime (persisted to keypair.json/device.json) and reuses
// it for every phone number ever paired. That is fine for a single-operator
// tool but would make every invoices.kz customer look like the same
// physical device to Kaspi's fraud detection. generateIdentity() here is
// called ONCE PER CONNECTION (at connect time) instead — see Global
// Constraints in the plan this was built from.
import crypto from 'crypto'

export interface Identity {
  deviceId: string
  installId: string
  pinHash: string
  identityPrivateKeyPem: string
  identityPublicKeyPem: string
}

export function generateIdentity(): Identity {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return {
    deviceId: crypto.randomUUID().toUpperCase(),
    installId: crypto.randomUUID().toUpperCase(),
    pinHash: crypto.createHash('md5').update(crypto.randomBytes(16)).digest('hex'),
    identityPrivateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    identityPublicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  }
}

// The reference project derives `pk` (an uncompressed EC point) and `pkTag`
// (its md5) from the DER encoding of the SAME identity public key used for
// signing — needed for the entrance-flow cookie/header set.
export function derivePkAndTag(publicKeyPem: string): { pk: string, pkTag: string } {
  const publicKey = crypto.createPublicKey(publicKeyPem)
  const der = publicKey.export({ type: 'spki', format: 'der' })
  const uncompressedPoint = der.subarray(der.length - 65)
  const pk = uncompressedPoint.toString('base64')
  const pkTag = crypto.createHash('md5').update(pk).digest('hex')
  return { pk, pkTag }
}

// Ephemeral — generated fresh for each pairing ("finish") attempt, discarded
// immediately after completeEcdh() runs. Not persisted, unlike Identity.
export function generateEphemeralEcdh(): { privateKey: crypto.KeyObject, publicKeyB64: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return { privateKey, publicKeyB64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') }
}

export function completeEcdh(privateKey: crypto.KeyObject, serverPublicKeyB64: string): Buffer {
  const serverPublicKey = crypto.createPublicKey({
    key: Buffer.from(serverPublicKeyB64, 'base64'),
    format: 'der',
    type: 'spki',
  })
  return crypto.diffieHellman({ privateKey, publicKey: serverPublicKey })
}

export function encryptAtRest(plaintext: string | Buffer, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const plaintextBuf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintextBuf), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptAtRest(ciphertextB64: string, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex')
  const buf = Buffer.from(ciphertextB64, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

const VTOKEN_SUITE = 'OCRA-1:HOTP-SHA256-6:QH64-T1M'

function hexToBytes(hex: string): Buffer {
  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substring(i, i + 2), 16))
  return Buffer.from(bytes)
}

// OCRA-1 (RFC 4226-style dynamic truncation), 30-second time step — this
// IS the connection's rolling "X-Kb-TokenSnMac" header value, recomputed on
// every signed request from the connection's stored tokenSn + shared secret.
export function computeTokenSnMac(tokenSn: string, secret: Buffer): string {
  const timeStep = BigInt(Date.now()) / BigInt(30000)
  const timeHex = timeStep.toString(16)

  const qHex = Buffer.from(tokenSn || '00000000').toString('hex').substring(0, 64)
  const suiteBytes = Buffer.from(VTOKEN_SUITE)
  const separator = Buffer.from([0x00])
  const qBytes = hexToBytes(qHex.padEnd(256, '0'))
  const tBytes = hexToBytes(timeHex.padStart(16, '0'))

  const dataBuffer = Buffer.concat([suiteBytes, separator, qBytes, tBytes])
  const hash = crypto.createHmac('sha256', secret).update(dataBuffer).digest()

  const offset = hash[hash.length - 1] & 0x0f
  const binCode =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)

  return (binCode % 1000000).toString().padStart(6, '0')
}

export function signPayload(identityPrivateKeyPem: string, dataB64: string): string {
  const sign = crypto.createSign('SHA256')
  sign.update(dataB64)
  sign.end()
  return sign.sign(identityPrivateKeyPem).toString('base64')
}

export function computeXSU(url: string): string {
  return crypto.createHash('md5').update(url.toLowerCase()).digest('hex')
}

export function computeXSign(
  url: string,
  headers: Record<string, string>,
  xshOrder: string,
  body: string,
  identityPrivateKeyPem: string
): string {
  const keys = xshOrder.split(',')
  const lines: string[] = []
  for (const name of keys) {
    if (name === 'url') lines.push('url:' + url.toLowerCase())
    else lines.push(name.toLowerCase() + ':' + (headers[name] || ''))
  }
  let signText = lines.join('\n')
  if (body) signText += '\n' + body
  const hash = crypto.createHash('sha256').update(signText, 'utf8').digest()

  // Signs the raw digest bytes, not its base64 form — deliberately a
  // separate code path from signPayload (used only by the finish step,
  // which signs a base64 *string* payload instead of a hash Buffer).
  const sign = crypto.createSign('SHA256')
  sign.update(hash)
  sign.end()
  return sign.sign(identityPrivateKeyPem).toString('base64')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kaspiPay/crypto.test.ts`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kaspiPay/crypto.ts src/lib/kaspiPay/crypto.test.ts
git commit -m "port Kaspi Pay crypto layer (per-connection identity, ECDH pairing, OCRA, ECDSA request signing) from tapter-dev/kaspi-pos-automation"
```

---

### Task 2: Port the reference protocol's network client — `src/lib/kaspiPay/client.ts`

**Files:**
- Create: `src/lib/kaspiPay/client.ts`

**Interfaces:**
- Consumes: `generateIdentity`, `derivePkAndTag`, `generateEphemeralEcdh`, `completeEcdh`, `computeTokenSnMac`, `signPayload`, `computeXSU`, `computeXSign`, `Identity` (Task 1).
- Produces:
  - `initConnect(phoneNumber: string): Promise<{ processId: string, identity: Identity, userToken: string | null }>`
  - `verifyOtp(processId: string, otp: string, identity: Identity, userToken: string | null): Promise<{ tokenSn: string, totpSeed: Buffer, profileId: string, organizationId: string | null, organizationIdn: string | null, organizationKbe: string | null }>`
  - `createPayment(connection: KaspiConnection, params: { amount: number, orderId: string }): Promise<{ operationId: string, qrToken: string, paymentLink: string, expiresAt: string }>`
  - `checkStatus(connection: KaspiConnection, operationId: string): Promise<{ status: 'pending' | 'paid' | 'expired' | 'failed' }>`
  - `KaspiConnection` type: `{ tokenSn: string, totpSeed: Buffer, profileId: string, deviceId: string, installId: string, identityPrivateKeyPem: string, identityPublicKeyPem: string }`
  - all consumed by Task 4 (`initConnect`/`verifyOtp`), Task 6 (the `KaspiConnection` shape), Tasks 7/8/11 (`createPayment`/`checkStatus`).

Same controller-executed, port-not-fabricate rule as Task 1. The exact request/response shapes below were read from the reference project's live source this session (`routes/auth.js`, `routes/qr.js`, `routes/invoice.js`, `polling.js`, `helpers.js`, `config.js`) — re-read those files fresh if anything here seems inconsistent with Kaspi's actual current behavior during manual verification, since Kaspi's app-version constants and Kaspi's own protocol both drift over time without notice.

- [ ] **Step 1: Implement**

Create `src/lib/kaspiPay/client.ts`:

```ts
// Network client ported from tapter-dev/kaspi-pos-automation (MIT license).
// Every function takes an explicit KaspiConnection/Identity instead of the
// reference project's module-level DEVICE/ecKeyPair singletons — see
// crypto.ts's top comment for why (per-customer device identity).
import { randomUUID } from 'crypto'
import {
  Identity,
  generateIdentity,
  derivePkAndTag,
  generateEphemeralEcdh,
  completeEcdh,
  computeTokenSnMac,
  signPayload,
  computeXSU,
  computeXSign,
} from './crypto'

const KASPI_ENTRANCE_URL = 'https://entrance-pay.kaspi.kz'
const KASPI_MTOKEN_URL = 'https://mtoken.kaspi.kz'
const KASPI_QRPAY_URL = 'https://qrpay.kaspi.kz'

// Defaults match a known-good Kaspi Pay iOS client as of this session.
// Kaspi validates these and may reject unknown values if they drift too
// far from a real current app version — re-check config.js in the
// reference project if pairing starts failing with an unexplained error.
const APP = {
  version: '4.112.1',
  build: '1107',
  platform: 'iOS',
  platformVer: '18.4',
  locale: 'ru-RU',
  model: 'iPhone16,2',
  brand: 'Apple',
  deviceName: 'iPhone',
  screenW: '430.0',
  screenH: '932.0',
  cfNetwork: 'CFNetwork/3826.400.120',
  darwin: 'Darwin/24.4.0',
}
const UA_NATIVE = `Kaspi%20Pay/${APP.build} ${APP.cfNetwork} ${APP.darwin}`
const UA_BROWSER = `Mozilla/5.0 (iPhone; CPU iPhone OS ${APP.platformVer.replace('.', '_')} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`

const ENTRANCE_HEADERS_BASE: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Accept-Language': 'ru',
  'Accept-Encoding': 'gzip, deflate, br',
  Origin: KASPI_ENTRANCE_URL,
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  'User-Agent': UA_BROWSER,
}

function generateUUID(): string {
  return randomUUID().toUpperCase()
}

function nowISO(): string {
  const d = new Date()
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')
  const mm = String(Math.abs(off) % 60).padStart(2, '0')
  return d.toISOString().replace('Z', '').replace(/\.\d{3}/, `.${String(d.getMilliseconds()).padStart(3, '0')}`) + sign + hh + mm
}

function entranceCookie(identity: Identity, pk: string, pkTag: string, userToken: string | null): string {
  let c = `deviceId=${identity.deviceId}; installId=${identity.installId}; is_mobile_app=true; locale=${APP.locale}; ma_bld=${APP.build}; ma_platform_type=${APP.platform}; ma_platform_ver=${APP.platformVer}; ma_ver=${APP.version}; pk=${pk}; pkTag=${pkTag}; xs=R:0|E:0|RH:0|N:0`
  if (userToken) c += `; user_token=${userToken}`
  return c
}

function extractUserToken(setCookieHeaders: string[]): string | null {
  for (const c of setCookieHeaders) {
    const m = c.match(/user_token=([^;]+)/)
    if (m) return m[1]
  }
  return null
}

async function entranceStep(body: object, referer: string, identity: Identity, pk: string, pkTag: string, userToken: string | null) {
  const res = await fetch(`${KASPI_ENTRANCE_URL}/api/v1/entrance/step`, {
    method: 'POST',
    headers: {
      ...ENTRANCE_HEADERS_BASE,
      Referer: referer,
      Cookie: entranceCookie(identity, pk, pkTag, userToken),
    },
    body: JSON.stringify(body),
  })
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  const newUserToken = extractUserToken(setCookie) || userToken
  const json = await res.json()
  return { json, userToken: newUserToken }
}

export async function initConnect(phoneNumber: string): Promise<{ processId: string, identity: Identity, userToken: string | null }> {
  const identity = generateIdentity()
  const { pk, pkTag } = derivePkAndTag(identity.identityPublicKeyPem)

  const referer = `${KASPI_ENTRANCE_URL}/process/entrance/?auth=2&appBuild=${APP.build}&appVersion=${APP.version}&platformVersion=${APP.platformVer}&platformType=IOS&deviceBrand=${APP.brand}&deviceModel=${APP.model}&deviceId=${identity.deviceId}&installId=${identity.installId}&frontCameraAvailable=true&sf=registration&pc=KPEntrance&noPass=0`
  const { json: initBody, userToken } = await entranceStep({
    data: {},
    Data: {
      auth: '2', appBuild: APP.build, appVersion: APP.version, platformVersion: APP.platformVer,
      platformType: 'IOS', deviceBrand: APP.brand, deviceModel: APP.model,
      deviceId: identity.deviceId, installId: identity.installId,
      frontCameraAvailable: 'true', sf: 'registration', pc: 'KPEntrance', noPass: '0',
    },
    actType: 'Success',
  }, referer, identity, pk, pkTag, null)

  const processId = initBody.meta?.pId
  if (!processId) throw new Error('Kaspi entrance init did not return a processId: ' + JSON.stringify(initBody))

  const phoneReferer = `${KASPI_ENTRANCE_URL}/process/universal-enter-phone-number?pId=${processId}&firstPage=KPUniversalEnterPhoneNumber`
  const { json: phoneBody } = await entranceStep({
    meta: { pId: processId, sn: 'EnterPhoneNumber' },
    data: { phoneNumber },
    actType: 'Success',
  }, phoneReferer, identity, pk, pkTag, userToken)

  if (phoneBody.view?.code !== 'EnterOtp') {
    throw new Error('Kaspi did not send an OTP: ' + JSON.stringify(phoneBody))
  }

  return { processId, identity, userToken }
}

export async function verifyOtp(
  processId: string,
  otp: string,
  identity: Identity,
  userToken: string | null
): Promise<{ tokenSn: string, totpSeed: Buffer, profileId: string, organizationId: string | null, organizationIdn: string | null, organizationKbe: string | null }> {
  const { pk, pkTag } = derivePkAndTag(identity.identityPublicKeyPem)

  const referer = `${KASPI_ENTRANCE_URL}/process/universal-enter-phone-number?pId=${processId}&firstPage=KPUniversalEnterPhoneNumber`
  const { json: otpBody } = await entranceStep({
    meta: { pId: processId, sn: 'ViewEnterOtp' },
    data: { userOtp: otp, inputType: 'auto' },
    actType: 'Success',
  }, referer, identity, pk, pkTag, userToken)

  if (!(otpBody.data?.type === 'kpDeviceRegistration' || otpBody.view?.code === 'KPMobileCall')) {
    throw new Error('Kaspi rejected the OTP: ' + JSON.stringify(otpBody))
  }

  // ─── Finish: pair this connection's identity as a "device" with Kaspi ───
  const ecdh = generateEphemeralEcdh()

  const signedDataObj = {
    installId: identity.installId,
    time: nowISO(),
    auth: [{ value: '', type: 'pincode' }],
    userIdHash: '',
  }
  const signedDataB64 = Buffer.from(JSON.stringify(signedDataObj)).toString('base64')

  const finishUrl = `${KASPI_ENTRANCE_URL}/api/v1/kpentrance/finish`
  const finishHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: '*/*',
    'Accept-Language': 'ru',
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent': UA_NATIVE,
    'X-Time': nowISO(),
    'X-Call': 'notConnected',
    'X-Platform-Type': APP.platform,
    'X-PkTag': pkTag,
    'X-SU': computeXSU(finishUrl),
    'X-Net-Type': 'WIFI/ETHERNET',
    'X-Emulator': '0',
    'X-Locale': APP.locale,
    'X-SV': '2',
    'X-Request-ID': generateUUID(),
    'X-Time-Zone': 'GMT+05:00',
    'X-SH': 'url,X-Time-Zone,X-Request-ID,X-Net-Type,X-Emulator,X-Call,X-Platform-Type,X-Locale,X-Time,X-SV',
  }
  const finishBody = JSON.stringify({
    signed: { sign: signPayload(identity.identityPrivateKeyPem, signedDataB64), data: signedDataB64 },
    guard: { pinHash: identity.pinHash, x509: ecdh.publicKeyB64 },
    processId,
  })
  finishHeaders['X-Sign'] = computeXSign(finishUrl, finishHeaders, finishHeaders['X-SH'], finishBody, identity.identityPrivateKeyPem)

  const finishRes = await fetch(finishUrl, { method: 'POST', headers: finishHeaders, body: finishBody })
  const finishJson = await finishRes.json()

  if (!(finishJson.success && finishJson.data?.tokenSN)) {
    throw new Error('Kaspi finish failed: ' + JSON.stringify(finishJson))
  }
  const tokenSn = finishJson.data.tokenSN as string
  if (!finishJson.data.x509) throw new Error('Kaspi finish did not return a server x509 key')
  const totpSeed = completeEcdh(ecdh.privateKey, finishJson.data.x509)

  // ─── Org context ───
  const orgUrl = `${KASPI_MTOKEN_URL}/v08/organizations/org-context-otp`
  const orgHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: '*/*',
    'Accept-Language': 'ru',
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent': UA_NATIVE,
    'X-Kb-TokenSn': tokenSn,
    'X-Kb-TokenSnMac': computeTokenSnMac(tokenSn, totpSeed),
    'X-Install-ID': identity.installId,
    'X-App-Ver': APP.version,
    'X-App-Bld': APP.build,
    'X-Locale': APP.locale,
    'X-Call': 'notConnected',
    'X-Time': nowISO(),
    'X-S': 'R:0|E:0|RH:0|N:0',
    'X-SV': '2',
    'X-Kb-Client-Ip': '192.168.1.96',
    'X-PkTag': pkTag,
    'X-SU': computeXSU(orgUrl),
    'X-SH': 'url,X-Kb-Client-Ip,X-Time,X-App-Ver,X-SV,X-Locale,X-App-Bld,X-Install-ID,X-Kb-TokenSn,X-S,X-Kb-TokenSnMac,X-Call',
    'X-Request-ID': generateUUID(),
  }
  const orgPayload = JSON.stringify({
    DeviceInformation: {
      SdkVersion: 'AOTP service', DeviceId: identity.deviceId, ApplicationId: 'kz.kaspi.business',
      ScreenWidth: APP.screenW, Model: APP.model, ScreenHeight: APP.screenH, DeviceName: APP.deviceName,
      VersionName: APP.version, BuildRelease: `${APP.platform} ${APP.platformVer}`, Brand: APP.brand,
      Board: APP.platformVer, Platform: APP.platform, Product: 'Kaspi Pay', frontCameraAvailable: true,
      VersionCode: APP.build, InstallId: identity.installId,
    },
    OrganizationId: 0,
  })
  orgHeaders['X-Sign'] = computeXSign(orgUrl, orgHeaders, orgHeaders['X-SH'], orgPayload, identity.identityPrivateKeyPem)

  const orgRes = await fetch(orgUrl, { method: 'POST', headers: orgHeaders, body: orgPayload })
  const orgJson = await orgRes.json()
  const cur = orgJson.Data?.Current || {}

  if (!cur.ProfileId) throw new Error('Kaspi org-context did not return a ProfileId: ' + JSON.stringify(orgJson))

  return {
    tokenSn,
    totpSeed,
    profileId: String(cur.ProfileId),
    organizationId: cur.OrganizationId != null ? String(cur.OrganizationId) : null,
    organizationIdn: cur.OrganizationIdn || null,
    organizationKbe: cur.OrganizationKbe || null,
  }
}

export interface KaspiConnection {
  tokenSn: string
  totpSeed: Buffer
  profileId: string
  deviceId: string
  installId: string
  identityPrivateKeyPem: string
  identityPublicKeyPem: string
}

function buildSignedHeaders(url: string, connection: KaspiConnection, body?: string): Record<string, string> {
  const xsh = 'url,X-Install-ID,X-PI,X-App-Bld,X-Platform-Ver,X-Locale,X-App-Ver,X-Device-ID,X-SV,X-Time,X-Platform-Type,X-Call,X-Kb-TokenSnMac,X-Kb-TokenSn'
  const headers: Record<string, string> = {
    'X-Kb-TokenSn': connection.tokenSn,
    'X-Kb-TokenSnMac': computeTokenSnMac(connection.tokenSn, connection.totpSeed),
    'X-PI': connection.profileId,
    'X-Install-ID': connection.installId,
    'X-Device-ID': connection.deviceId,
    'X-App-Ver': APP.version,
    'X-App-Bld': APP.build,
    'X-Platform-Type': APP.platform,
    'X-Platform-Ver': APP.platformVer,
    'X-Locale': APP.locale,
    'X-Time': nowISO(),
    'X-Request-ID': generateUUID(),
    'X-Call': 'notConnected',
    'X-SV': '2',
    'X-SH': xsh,
    'User-Agent': UA_NATIVE,
    Accept: '*/*',
    'Accept-Language': 'ru',
    'Accept-Encoding': 'gzip, deflate, br',
  }
  headers['X-Sign'] = computeXSign(url, headers, xsh, body || '', connection.identityPrivateKeyPem)
  return headers
}

export async function createPayment(
  connection: KaspiConnection,
  params: { amount: number, orderId: string }
): Promise<{ operationId: string, qrToken: string, paymentLink: string, expiresAt: string }> {
  const url = `${KASPI_QRPAY_URL}/v01/qr-token/create`
  const payload = JSON.stringify({
    PaymentAmount: params.amount,
    DeviceInterface: 'Pos',
    Latitude: 43.204643483375889,
    Longitude: 76.891962364115912,
  })
  const headers = { ...buildSignedHeaders(url, connection, payload), 'Content-Type': 'application/json' }
  const res = await fetch(url, { method: 'POST', headers, body: payload })
  const json = await res.json()
  const d = json.Data
  if (!d?.QrOperationId) throw new Error('Kaspi qr-token/create failed: ' + JSON.stringify(json))

  return {
    operationId: String(d.QrOperationId),
    qrToken: d.QrToken,
    paymentLink: (d.QrToken as string).replace('https://qr.kaspi.kz/', 'https://pay.kaspi.kz/pay/'),
    expiresAt: d.ExpireDate,
  }
}

const QR_PAID = new Set(['Processed'])
const QR_FAILED = new Set([
  'CancelledByUser', 'NotConfirmedByUser', 'CancelledByExternalSource', 'ProcessingFailed',
  'Rejected', 'InsufficientFunds', 'InsufficientFundsError', 'Error',
  'IrisSrcBlockCode1', 'IrisSrcBlockCode3', 'IrisSrcBlockCode9',
  'IrisDestBlockCode3', 'IrisDestBlockCode5', 'IrisDestBlockCode7', 'IrisDestBlockCode10',
])
const QR_EXPIRED = new Set(['QrTokenDiscarded', 'Expired'])

export async function checkStatus(
  connection: KaspiConnection,
  operationId: string
): Promise<{ status: 'pending' | 'paid' | 'expired' | 'failed' }> {
  const url = `${KASPI_QRPAY_URL}/v02/kaspi-qr/status?qrOperationId=${operationId}`
  const res = await fetch(url, { headers: buildSignedHeaders(url, connection) })
  const json = await res.json()
  const status: string | undefined = json.Data?.Status

  if (!status) return { status: 'pending' }
  if (QR_PAID.has(status)) return { status: 'paid' }
  if (QR_EXPIRED.has(status)) return { status: 'expired' }
  if (QR_FAILED.has(status)) return { status: 'failed' }
  return { status: 'pending' } // QrTokenCreated, Wait, or any other in-flight status
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kaspiPay/client.ts
git commit -m "port Kaspi Pay network client (SMS pairing, QR payment creation, status polling) from tapter-dev/kaspi-pos-automation"
```

---

### Task 3: Database schema — `kaspi_connections` and `kaspi_payment_requests`

**Files:** none in the repo (applied directly via Supabase MCP, this codebase's established pattern — no `supabase/migrations` directory exists)

**Interfaces:**
- Produces: the two tables, consumed by Tasks 4, 5, 6, 7, 8.

- [ ] **Step 1: Apply the schema**

Using the Supabase MCP `apply_migration` tool:

```sql
create table kaspi_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_number text not null,
  -- Per-connection device identity — see Global Constraints: the reference
  -- project uses ONE shared identity for every pairing, which would make
  -- every invoices.kz customer look like "the same device" to Kaspi. Each
  -- row here gets its OWN identity, generated once at connect time.
  device_id text not null,
  install_id text not null,
  pin_hash text not null,
  identity_private_key_enc text not null,
  identity_public_key_pem text not null, -- not secret, stored plain
  -- Pairing result — the OCRA/TOTP seed for this connection's every future
  -- signed request (derived once via ECDH during pairing, never regenerated).
  totp_seed_enc text not null,
  token_sn text not null,
  profile_id text not null,
  organization_id text,
  organization_idn text,
  organization_kbe text,
  api_token_hash text not null,
  status text not null default 'active',
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id)
);
alter table kaspi_connections enable row level security;
-- No policies: service_role only, same reasoning as bcc_connections — this
-- table holds material more sensitive than an OAuth token and must never
-- be reachable from the browser under any circumstance.

create table kaspi_payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade,
  order_id text not null,
  amount numeric not null,
  kaspi_operation_id text not null,
  qr_token text,
  payment_link text,
  callback_url text,
  status text not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table kaspi_payment_requests enable row level security;
create policy "users read own payment requests" on kaspi_payment_requests
  for select using (auth.uid() = user_id);
```

- [ ] **Step 2: Verify**

Using `execute_sql`: `select table_name from information_schema.tables where table_name in ('kaspi_connections','kaspi_payment_requests');` confirms both exist. `select tablename, policyname, cmd from pg_policies where tablename in ('kaspi_connections','kaspi_payment_requests');` confirms exactly one policy (`kaspi_payment_requests`, `select`) and `kaspi_connections` has zero.

- [ ] **Step 3: Generate the encryption key**

```bash
openssl rand -hex 32
```

Append to `.env.local`:

```
KASPI_SESSION_ENCRYPTION_KEY=<output above>
```

This same value needs to be added to Vercel's Production environment in the final task before this works in production.

- [ ] **Step 4: No file commit for this task**

Schema lives in Supabase, not the repo; the `.env.local` addition is gitignored. Proceed directly to Task 4.

---

### Task 4: `src/app/api/kaspi/connect/init/route.ts` and `.../verify/route.ts`

**Files:**
- Create: `src/lib/kaspiPay/pendingConnect.ts`
- Create: `src/app/api/kaspi/connect/init/route.ts`
- Create: `src/app/api/kaspi/connect/verify/route.ts`

**Interfaces:**
- Consumes: `initConnect`, `verifyOtp` (Task 2); `encryptAtRest` (Task 1); `kaspi_connections` table (Task 3); `KASPI_SESSION_ENCRYPTION_KEY` env var.
- Produces: `POST /api/kaspi/connect/init` → `{ processId }`; `POST /api/kaspi/connect/verify` → `{ apiToken }` (shown once) — both consumed by Task 9's page.

- [ ] **Step 1: Create the shared pending-attempt store**

Route handler modules in this Next.js version may only export the HTTP-method handlers and a small set of framework-recognized config exports — an arbitrary extra named export (like a shared `Map`) is not a supported pattern here, so the in-progress pairing state lives in its own plain module instead, imported by both routes.

Create `src/lib/kaspiPay/pendingConnect.ts`:

```ts
// In-progress Kaspi Cashier pairing attempts, keyed by processId. A
// serverless function instance is not guaranteed to survive between the
// init and verify calls, so this is a best-effort in-memory cache — if it's
// cold on verify, the user must restart the connect flow. Acceptable: this
// is a one-time setup action, not a hot path.
interface PendingAttempt {
  devicePrivateKeyPem: string
  userId: string
  phoneNumber: string
}

const pending = new Map<string, PendingAttempt>()

export function setPendingAttempt(processId: string, attempt: PendingAttempt) {
  pending.set(processId, attempt)
}

export function getPendingAttempt(processId: string): PendingAttempt | undefined {
  return pending.get(processId)
}

export function deletePendingAttempt(processId: string) {
  pending.delete(processId)
}
```

- [ ] **Step 2: Implement the init route**

Create `src/app/api/kaspi/connect/init/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { initConnect } from '@/lib/kaspiPay/client'
import { setPendingAttempt } from '@/lib/kaspiPay/pendingConnect'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { phoneNumber } = await req.json()
  if (!phoneNumber) return NextResponse.json({ error: 'phoneNumber required' }, { status: 400 })

  try {
    const { processId, devicePrivateKeyPem } = await initConnect(phoneNumber)
    setPendingAttempt(processId, { devicePrivateKeyPem, userId: user.id, phoneNumber })
    return NextResponse.json({ processId })
  } catch (e: any) {
    console.error('Kaspi connect init error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
}
```

- [ ] **Step 3: Implement the verify route**

Create `src/app/api/kaspi/connect/verify/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { verifyOtp } from '@/lib/kaspiPay/client'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'
import { getPendingAttempt, deletePendingAttempt } from '@/lib/kaspiPay/pendingConnect'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { processId, otp } = await req.json()
  if (!processId || !otp) return NextResponse.json({ error: 'processId and otp required' }, { status: 400 })

  const attempt = getPendingAttempt(processId)
  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json({ error: 'expired_or_invalid_process' }, { status: 400 })
  }

  try {
    const { tokenSn, totpSeedHex, profileId } = await verifyOtp(processId, otp, attempt.devicePrivateKeyPem)
    deletePendingAttempt(processId)

    const apiToken = crypto.randomBytes(32).toString('hex')
    const apiTokenHash = crypto.createHash('sha256').update(apiToken).digest('hex')
    const key = process.env.KASPI_SESSION_ENCRYPTION_KEY!

    const { error } = await supabase.from('kaspi_connections').upsert({
      user_id: user.id,
      phone_number: attempt.phoneNumber,
      device_private_key_enc: encryptAtRest(attempt.devicePrivateKeyPem, key),
      totp_seed_enc: encryptAtRest(totpSeedHex, key),
      token_sn: tokenSn,
      profile_id: profileId,
      api_token_hash: apiTokenHash,
      status: 'active',
    }, { onConflict: 'user_id' })

    if (error) {
      console.error('Kaspi connection upsert error:', error.message)
      return NextResponse.json({ error: 'save_failed' }, { status: 500 })
    }

    // Shown exactly once — only the hash is ever stored.
    return NextResponse.json({ apiToken })
  } catch (e: any) {
    console.error('Kaspi verify-otp error:', e.message)
    return NextResponse.json({ error: 'invalid_otp' }, { status: 400 })
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

With a real (test) Kaspi Cashier phone number, call `init` then `verify` with the real SMS code received, confirm a `kaspi_connections` row is created (`select user_id, token_sn, status from kaspi_connections;` via the Supabase MCP `execute_sql` tool) and an `apiToken` is returned.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kaspiPay/pendingConnect.ts src/app/api/kaspi/connect/init/route.ts src/app/api/kaspi/connect/verify/route.ts
git commit -m "add Kaspi Cashier connect routes (SMS init/verify, encrypted session storage)"
```

---

### Task 5: `src/app/api/kaspi/disconnect/route.ts`

**Files:**
- Create: `src/app/api/kaspi/disconnect/route.ts`

**Interfaces:**
- Consumes: `kaspi_connections` table (Task 3).
- Produces: `POST /api/kaspi/disconnect` → `{ ok: true }`, consumed by Task 9's page.

- [ ] **Step 1: Implement**

Create `src/app/api/kaspi/disconnect/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('kaspi_connections').delete().eq('user_id', user.id)
  if (error) {
    console.error('Kaspi disconnect error:', error.message)
    return NextResponse.json({ error: 'disconnect_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With a connection established (Task 4), call this route and confirm `select count(*) from kaspi_connections where user_id = '<id>';` returns `0`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kaspi/disconnect/route.ts
git commit -m "add Kaspi Cashier disconnect route"
```

---

### Task 6: `src/lib/kaspiPay/connection.ts` — shared connection loader

**Files:**
- Create: `src/lib/kaspiPay/connection.ts`

**Interfaces:**
- Consumes: `decryptAtRest` (Task 1); `kaspi_connections` table (Task 3).
- Produces: `loadConnectionByUserId(userId: string): Promise<KaspiConnection | null>`, `loadConnectionByApiToken(token: string): Promise<{ connection: KaspiConnection, userId: string } | null>` — both consumed by Tasks 7 and 8, so the decrypt-and-shape logic lives in exactly one place instead of being duplicated across routes.

- [ ] **Step 1: Implement**

Create `src/lib/kaspiPay/connection.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { decryptAtRest } from './crypto'
import { KaspiConnection } from './client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toConnection(row: any): KaspiConnection {
  const key = process.env.KASPI_SESSION_ENCRYPTION_KEY!
  return {
    tokenSn: row.token_sn,
    totpSeed: decryptAtRest(row.totp_seed_enc, key),
    profileId: row.profile_id,
    deviceId: row.device_id,
    installId: row.install_id,
    identityPrivateKeyPem: decryptAtRest(row.identity_private_key_enc, key).toString('utf8'),
    identityPublicKeyPem: row.identity_public_key_pem,
  }
}

export async function loadConnectionByUserId(userId: string): Promise<KaspiConnection | null> {
  const { data } = await supabase
    .from('kaspi_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return data ? toConnection(data) : null
}

export async function loadConnectionByApiToken(token: string): Promise<{ connection: KaspiConnection, userId: string } | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { data } = await supabase
    .from('kaspi_connections')
    .select('*')
    .eq('api_token_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle()
  return data ? { connection: toConnection(data), userId: data.user_id } : null
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kaspiPay/connection.ts
git commit -m "add shared Kaspi connection loader (by user id or by public API token)"
```

---

### Task 7: `src/app/api/kaspi/pay/route.ts` — the public documented API

**Files:**
- Create: `src/app/api/kaspi/pay/route.ts`

**Interfaces:**
- Consumes: `loadConnectionByApiToken` (Task 6); `createPayment` (Task 2); `kaspi_payment_requests` table (Task 3).
- Produces: `POST /api/kaspi/pay` → `{ qr_token, payment_link, operation_id, expire_date }` — this is the real public contract, documented for real external customers in Task 10's docs page. Task review confirmed this is **not** field-for-field identical to `create/route.ts`'s existing xpayment response (that route returns `ext_tran_id`, not `operation_id`) — `create/route.ts` is invoices.kz's own internal subscription-billing integration, not something any external customer ever called, so this is a fresh public contract, not a drop-in replacement for that internal route's shape. Task 10 must document this route's actual fields, not claim parity with `create/route.ts`.

- [ ] **Step 1: Implement**

Create `src/app/api/kaspi/pay/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnectionByApiToken } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // loadConnectionByApiToken throws on a genuine DB error (Task 6) rather
  // than returning null — that must not be conflated with "bad token".
  let found: Awaited<ReturnType<typeof loadConnectionByApiToken>>
  try {
    found = await loadConnectionByApiToken(token)
  } catch (e: any) {
    console.error('Kaspi connection lookup error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
  if (!found) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount, order_id, callback_url } = await req.json()
  if (!amount || !order_id) {
    return NextResponse.json({ error: 'amount and order_id required' }, { status: 400 })
  }

  try {
    const payment = await createPayment(found.connection, { amount, orderId: order_id })

    await supabase.from('kaspi_payment_requests').insert({
      user_id: found.userId,
      invoice_id: null,
      order_id,
      amount,
      kaspi_operation_id: payment.operationId,
      qr_token: payment.qrToken,
      payment_link: payment.paymentLink,
      callback_url: callback_url || null,
      status: 'pending',
      expires_at: payment.expiresAt,
    })

    return NextResponse.json({
      qr_token: payment.qrToken,
      payment_link: payment.paymentLink,
      operation_id: payment.operationId,
      expire_date: payment.expiresAt,
    })
  } catch (e: any) {
    console.error('Kaspi pay create error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With a real connection established (Task 4), call:

```bash
curl -X POST http://localhost:3000/api/kaspi/pay \
  -H "Authorization: Bearer <apiToken from Task 4's verify response>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "order_id": "test-order-1"}'
```

Expected: `{"qr_token": "...", "payment_link": "...", "operation_id": "...", "expire_date": "..."}`. Confirm a real Kaspi Pay app shows a matching payment request when the QR/link is used.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kaspi/pay/route.ts
git commit -m "add public Kaspi Pay payment-creation API (token-authenticated)"
```

---

### Task 8: `src/app/api/cron/kaspi-poll/route.ts` + vercel.json

**Files:**
- Create: `src/app/api/cron/kaspi-poll/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `loadConnectionByUserId` (Task 6); `checkStatus` (Task 2); `kaspi_payment_requests` table (Task 3); `webhookSignature.ts`'s HMAC scheme (existing, mirrored for outbound signing).
- Produces: `GET /api/cron/kaspi-poll` — nothing else depends on it besides Vercel's scheduler.

- [ ] **Step 1: Implement**

Create `src/app/api/cron/kaspi-poll/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { loadConnectionByUserId } from '@/lib/kaspiPay/connection'
import { checkStatus } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function signWebhookPayload(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: requests } = await supabase
    .from('kaspi_payment_requests')
    .select('*')
    .eq('status', 'pending')

  let paid = 0

  for (const reqRow of (requests || []) as any[]) {
    try {
      if (reqRow.expires_at && new Date(reqRow.expires_at) <= new Date()) {
        await supabase.from('kaspi_payment_requests').update({ status: 'expired' }).eq('id', reqRow.id)
        continue
      }

      const connection = await loadConnectionByUserId(reqRow.user_id)
      if (!connection) continue // connection was disconnected after the request was created

      const result = await checkStatus(connection, reqRow.kaspi_operation_id)
      if (result.status !== 'paid') continue

      await supabase.from('kaspi_payment_requests').update({ status: 'paid' }).eq('id', reqRow.id)
      paid++

      if (reqRow.invoice_id) {
        await supabase.from('invoices').update({ status: 'paid' }).eq('id', reqRow.invoice_id)
        await supabase.from('invoice_logs').insert({ invoice_id: reqRow.invoice_id, status: 'paid' })
      }

      if (reqRow.callback_url) {
        const secret = process.env.KASPI_SESSION_ENCRYPTION_KEY! // reuse: no separate per-customer webhook secret in v1
        const payload = JSON.stringify({
          event: 'payment.success',
          order_id: reqRow.order_id,
          amount: reqRow.amount,
          operation_id: reqRow.kaspi_operation_id,
        })
        await fetch(reqRow.callback_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Kaspi-Pay-Signature': signWebhookPayload(payload, secret),
          },
          body: payload,
        }).catch((e) => console.error('Kaspi webhook delivery failed for', reqRow.id, e.message))
      }
    } catch (e: any) {
      console.error('Kaspi poll error for request', reqRow.id, e.message)
    }
  }

  return NextResponse.json({ ok: true, paid })
}
```

- [ ] **Step 2: Add the cron schedule**

Modify `vercel.json` — add an entry to the `crons` array:

```json
{
  "path": "/api/cron/kaspi-poll",
  "schedule": "*/5 * * * *"
}
```

(Every 5 minutes — confirm this satisfies the current Vercel plan's minimum cron granularity before committing to this exact value; the design doc flags this as an open item.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

With a pending payment request from Task 7's test, pay it via a real Kaspi Pay app, then call:

```bash
curl http://localhost:3000/api/cron/kaspi-poll -H "Authorization: Bearer <CRON_SECRET from .env.local>"
```

Expected: `{"ok":true,"paid":1}`, and `select status from kaspi_payment_requests where id = '...';` shows `paid`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/kaspi-poll/route.ts vercel.json
git commit -m "add Kaspi payment-status polling cron"
```

---

### Task 9: i18n + `src/app/profile/kaspi-pay/page.tsx`

**Files:**
- Create: `src/lib/i18n/kaspiPay.ts`
- Create: `src/app/api/kaspi/status/route.ts`
- Create: `src/app/profile/kaspi-pay/page.tsx`

**Interfaces:**
- Consumes: `/api/kaspi/connect/init`, `/api/kaspi/connect/verify`, `/api/kaspi/disconnect` (Tasks 4, 5); `canAcquiring` (`src/lib/plan.ts`, existing); `kaspi_connections` table (Task 3).
- Produces: `GET /api/kaspi/status` → `{ connected: boolean }`, consumed by this same task's page on load; the settings page itself — nothing else depends on it.

- [ ] **Step 1: Create the i18n dict**

Create `src/lib/i18n/kaspiPay.ts`:

```ts
export interface KaspiPayContent {
  headerLabel: string
  introText: string
  proBadge: string
  proLockedHint: string
  goToPlansButton: string
  loadingLabel: string
  phoneLabel: string
  phonePlaceholder: string
  sendCodeButton: string
  sendingCodeLabel: string
  otpLabel: string
  otpPlaceholder: string
  verifyButton: string
  verifyingLabel: string
  connectedMessage: string
  tokenShownOnceWarning: string
  copyTokenButton: string
  disconnectButton: string
  disconnectingLabel: string
  errorGeneric: string
  errorInvalidOtp: string
  docsLinkLabel: string
}

export const kaspiPayDict: Record<'ru' | 'kk' | 'en', KaspiPayContent> = {
  ru: {
    headerLabel: 'Приём платежей через Kaspi',
    introText: 'Подключите роль «Кассир» из вашего приложения Kaspi Pay, чтобы автоматически получать ссылки на оплату для своих счетов и принимать платежи на своём сайте или в приложении через наш API.',
    proBadge: 'Про',
    proLockedHint: 'Доступно на тарифе Про',
    goToPlansButton: 'Перейти к тарифам',
    loadingLabel: 'Загрузка...',
    phoneLabel: 'Номер телефона кассира',
    phonePlaceholder: '+7 707 123 45 67',
    sendCodeButton: 'Отправить код',
    sendingCodeLabel: 'Отправляем...',
    otpLabel: 'Код из SMS',
    otpPlaceholder: '1234',
    verifyButton: 'Подтвердить',
    verifyingLabel: 'Проверяем...',
    connectedMessage: 'Кассир успешно подключён.',
    tokenShownOnceWarning: 'Сохраните этот токен сейчас — он показывается только один раз и понадобится для вызова API.',
    copyTokenButton: 'Скопировать',
    disconnectButton: 'Отключить',
    disconnectingLabel: 'Отключаем...',
    errorGeneric: 'Сервис Kaspi временно недоступен. Попробуйте позже.',
    errorInvalidOtp: 'Неверный код из SMS. Попробуйте ещё раз.',
    docsLinkLabel: 'Документация по API',
  },
  kk: {
    headerLabel: 'Kaspi арқылы төлемдерді қабылдау',
    introText: 'Шоттарыңыз үшін автоматты түрде төлем сілтемелерін алу және өз сайтыңызда немесе қосымшаңызда біздің API арқылы төлемдерді қабылдау үшін Kaspi Pay қосымшасындағы «Кассир» рөлін қосыңыз.',
    proBadge: 'Про',
    proLockedHint: 'Про тарифінде қолжетімді',
    goToPlansButton: 'Тарифтерге өту',
    loadingLabel: 'Жүктелуде...',
    phoneLabel: 'Кассирдің телефон нөмірі',
    phonePlaceholder: '+7 707 123 45 67',
    sendCodeButton: 'Кодты жіберу',
    sendingCodeLabel: 'Жіберілуде...',
    otpLabel: 'SMS кодын',
    otpPlaceholder: '1234',
    verifyButton: 'Растау',
    verifyingLabel: 'Тексерілуде...',
    connectedMessage: 'Кассир сәтті қосылды.',
    tokenShownOnceWarning: 'Бұл токенді қазір сақтаңыз — ол тек бір рет көрсетіледі және API шақыру үшін қажет болады.',
    copyTokenButton: 'Көшіру',
    disconnectButton: 'Ажырату',
    disconnectingLabel: 'Ажыратылуда...',
    errorGeneric: 'Kaspi қызметі уақытша қолжетімсіз. Кейінірек көріңіз.',
    errorInvalidOtp: 'SMS коды дұрыс емес. Қайталап көріңіз.',
    docsLinkLabel: 'API құжаттамасы',
  },
  en: {
    headerLabel: 'Accept payments via Kaspi',
    introText: 'Connect the "Cashier" role from your Kaspi Pay app to automatically get payment links for your invoices and accept payments on your own site or app through our API.',
    proBadge: 'Pro',
    proLockedHint: 'Available on the Pro plan',
    goToPlansButton: 'View plans',
    loadingLabel: 'Loading...',
    phoneLabel: 'Cashier phone number',
    phonePlaceholder: '+7 707 123 45 67',
    sendCodeButton: 'Send code',
    sendingCodeLabel: 'Sending...',
    otpLabel: 'SMS code',
    otpPlaceholder: '1234',
    verifyButton: 'Verify',
    verifyingLabel: 'Verifying...',
    connectedMessage: 'Cashier connected successfully.',
    tokenShownOnceWarning: 'Save this token now — it is shown only once and is needed to call the API.',
    copyTokenButton: 'Copy',
    disconnectButton: 'Disconnect',
    disconnectingLabel: 'Disconnecting...',
    errorGeneric: 'The Kaspi service is temporarily unavailable. Try again later.',
    errorInvalidOtp: 'Invalid SMS code. Please try again.',
    docsLinkLabel: 'API documentation',
  },
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit the i18n file**

```bash
git add src/lib/i18n/kaspiPay.ts
git commit -m "add i18n dict for the Kaspi Pay Cashier connect UI"
```

- [ ] **Step 4: Create the status route**

Create `src/app/api/kaspi/status/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// kaspi_connections has zero client-facing RLS policies (Task 3) — the page
// cannot query it directly, same reasoning as /api/bcc/status.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('kaspi_connections')
    .select('status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  return NextResponse.json({ connected: !!data })
}
```

- [ ] **Step 5: Implement the page**

Create `src/app/profile/kaspi-pay/page.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { kaspiPayDict } from '@/lib/i18n/kaspiPay'

export default function KaspiPayPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = kaspiPayDict[lang]

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [connected, setConnected] = useState(false)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [processId, setProcessId] = useState<string | null>(null)
  const [apiToken, setApiToken] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    // kaspi_connections has no client-facing RLS policy — status is read
    // through this authenticated route, not a direct table query.
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/kaspi/status', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setConnected(!!data.connected)
    }

    setLoading(false)
  }

  async function sendCode() {
    setError('')
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/connect/init', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      })
      const data = await res.json()
      if (!res.ok || !data.processId) { setError(t.errorGeneric); return }
      setProcessId(data.processId)
    } finally {
      setSending(false)
    }
  }

  async function verify() {
    setError('')
    setVerifying(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi/connect/verify', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId, otp }),
      })
      const data = await res.json()
      if (!res.ok || !data.apiToken) { setError(t.errorInvalidOtp); return }
      setApiToken(data.apiToken)
      setConnected(true)
      setProcessId(null)
    } finally {
      setVerifying(false)
    }
  }

  async function disconnect() {
    setDisconnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/kaspi/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      setConnected(false)
      setApiToken(null)
    } finally {
      setDisconnecting(false)
    }
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

            {error && <p className="text-xs text-red-500 px-1">{error}</p>}

            {apiToken ? (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="text-sm font-medium text-[#1C2056] mb-2">{t.connectedMessage}</div>
                <div className="text-xs text-amber-600 mb-2">{t.tokenShownOnceWarning}</div>
                <div className="bg-gray-50 rounded-xl p-3 text-xs font-mono break-all mb-3">{apiToken}</div>
                <button onClick={() => navigator.clipboard.writeText(apiToken)}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium mb-2">
                  {t.copyTokenButton}
                </button>
                <button onClick={disconnect} disabled={disconnecting}
                  className="w-full bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm font-medium">
                  {disconnecting ? t.disconnectingLabel : t.disconnectButton}
                </button>
              </div>
            ) : connected ? (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="text-sm font-medium text-[#1C2056] mb-3">{t.connectedMessage}</div>
                <button onClick={disconnect} disabled={disconnecting}
                  className="w-full bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm font-medium">
                  {disconnecting ? t.disconnectingLabel : t.disconnectButton}
                </button>
              </div>
            ) : !processId ? (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <label className="block text-xs text-gray-500 mb-1">{t.phoneLabel}</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phonePlaceholder}
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056] mb-3" />
                <button onClick={sendCode} disabled={sending || !phone}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                  {sending ? t.sendingCodeLabel : t.sendCodeButton}
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <label className="block text-xs text-gray-500 mb-1">{t.otpLabel}</label>
                <input value={otp} onChange={e => setOtp(e.target.value)} placeholder={t.otpPlaceholder}
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056] mb-3" />
                <button onClick={verify} disabled={verifying || !otp}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                  {verifying ? t.verifyingLabel : t.verifyButton}
                </button>
              </div>
            )}

            <button onClick={() => router.push('/profile/kaspi-pay/docs')}
              className="w-full text-xs text-[#1C2056] underline text-center py-2">
              {t.docsLinkLabel}
            </button>
          </>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

`npm run dev`, sign in as a Pro user, visit `/profile/kaspi-pay`, enter a real Cashier phone number, receive and enter the SMS code, confirm the API token is shown once. Reload the page and confirm it shows the connected state (not the phone-entry form again) — this exercises the `/api/kaspi/status` round-trip from Step 4.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/kaspi/status/route.ts src/app/profile/kaspi-pay/page.tsx
git commit -m "add Kaspi Cashier connect/disconnect page with status check on load"
```

---

### Task 10: `src/app/profile/kaspi-pay/docs/page.tsx` — public API documentation

**Files:**
- Create: `src/app/profile/kaspi-pay/docs/page.tsx`

**Interfaces:**
- Consumes: nothing (static content page).
- Produces: nothing consumed elsewhere — the terminal page in this feature's navigation.

- [ ] **Step 1: Implement**

Create `src/app/profile/kaspi-pay/docs/page.tsx` as a static documentation page (`'use client'` not required — a plain server component) explaining, in Russian (matching this codebase's primary-language convention for supporting/help content):
- How to get the API token (via `/profile/kaspi-pay`, shown once at connect time).
- The request shape: `POST https://www.invoices.kz/api/kaspi/pay`, header `Authorization: Bearer <token>`, body `{ "amount": number, "order_id": "string", "callback_url": "string (optional)" }`.
- The response shape: `{ "qr_token": "...", "payment_link": "...", "operation_id": "...", "expire_date": "..." }`.
- The webhook: a `POST` to the supplied `callback_url` with body `{ "event": "payment.success", "order_id", "amount", "operation_id" }` and header `X-Kaspi-Pay-Signature: <hex HMAC-SHA256>` — verified the same way this codebase already verifies xpayment's own webhook (`src/lib/webhookSignature.ts`'s `isValidSignature`), just with the customer's own means of computing the expected signature instead.
- A curl example matching the exact fields above.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/profile/kaspi-pay/docs/page.tsx
git commit -m "add public API documentation page for the Kaspi Pay integration"
```

---

### Task 11: Auto-generate a payment link when an invoice is sent, surface it on both invoice views

**Files:**
- Modify: `src/app/api/send-invoice/route.ts:1-140` (this is the confirmed "issue an invoice to a client" moment in this codebase — it emails the client and flips `status` to `'sent'`; found via `grep -rn "status: 'sent'" src/app`)
- Create: `src/app/api/kaspi/invoice-payment/route.ts`
- Modify: `src/app/invoice/[id]/page.tsx` (owner's authenticated view — add a display block)
- Modify: `src/app/view/[token]/page.tsx` (public, unauthenticated client-facing view — add a display block)

**Interfaces:**
- Consumes: `loadConnectionByUserId` (Task 6); `createPayment` (Task 2); `kaspi_payment_requests` table (Task 3).
- Produces: a `kaspi_payment_requests` row with `invoice_id` set whenever `send-invoice` runs for an owner with an active Kaspi connection; a new public `GET /api/kaspi/invoice-payment?token=<public_token>` route consumed by `/view/[token]`.

- [ ] **Step 1: Generate the payment link inside `send-invoice`**

In `src/app/api/send-invoice/route.ts`, add the import at the top:

```ts
import { loadConnectionByUserId } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'
```

Right after `const { data: inv } = await supabase...` and its null-check (after line 32's `if (inv.user_id !== user.id) ...`), insert:

```ts
    let kaspiPaymentLink: string | null = null
    let kaspiQrToken: string | null = null
    try {
      const connection = await loadConnectionByUserId(inv.user_id)
      if (connection) {
        const payment = await createPayment(connection, { amount: Number(inv.amount), orderId: inv.id })
        await supabase.from('kaspi_payment_requests').insert({
          user_id: inv.user_id,
          invoice_id: inv.id,
          order_id: inv.id,
          amount: inv.amount,
          kaspi_operation_id: payment.operationId,
          qr_token: payment.qrToken,
          payment_link: payment.paymentLink,
          status: 'pending',
          expires_at: payment.expiresAt,
        })
        kaspiPaymentLink = payment.paymentLink
        kaspiQrToken = payment.qrToken
      }
    } catch (e: any) {
      // A Kaspi failure must never block sending the invoice itself — the
      // client can still pay by bank transfer, the owner just won't get an
      // automated Kaspi link for this particular send.
      console.error('Kaspi payment-link generation failed for invoice', inv.id, e.message)
    }
```

Then, inside the email's `html` template, right after the existing "ОТКРЫТЬ СЧЁТ ОНЛАЙН" button block (after the closing `</a>` around line 113), add a conditional Kaspi block:

```ts
    ${kaspiPaymentLink ? `
    <a href="${kaspiPaymentLink}" style="display:block; background:#E4171F; color:white; text-align:center; padding:14px 20px; text-decoration:none; font-size:14px; font-weight:bold; letter-spacing:0.5px; margin-bottom:16px;">
      ОПЛАТИТЬ ЧЕРЕЗ KASPI →
    </a>
    ` : ''}
```

(`#E4171F` is Kaspi's own brand red — matches the visual convention of every other Kaspi-branded button across the Kazakhstani web; adjust if this codebase has an existing Kaspi-brand color constant defined elsewhere, in which case reuse that instead of hardcoding.)

- [ ] **Step 2: Create the public invoice-payment lookup route**

Create `src/app/api/kaspi/invoice-payment/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public, unauthenticated — the payer viewing /view/[token] is never logged
// in. kaspi_payment_requests has no client-facing RLS policy scoped to an
// anonymous public_token match, so this service-role route is the only way
// for that page to learn whether a Kaspi payment link exists for it,
// mirroring how /api/bcc/status exists because bcc_connections has no
// client-facing SELECT policy either.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('public_token', token)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ payment: null })

  const { data: payment } = await supabase
    .from('kaspi_payment_requests')
    .select('qr_token, payment_link, status')
    .eq('invoice_id', invoice.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .maybeSingle()

  return NextResponse.json({ payment: payment || null })
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Surface the link on the owner's invoice page**

In `src/app/invoice/[id]/page.tsx`, add a `kaspiPayment` state (`useState<{qr_token, payment_link, status} | null>(null)`), fetch it in the existing data-load effect via `supabase.from('kaspi_payment_requests').select('qr_token, payment_link, status').eq('invoice_id', id).eq('status', 'pending').order('created_at', {ascending: false}).maybeSingle()` (this table's RLS already allows the authenticated owner to read their own rows — no new route needed here, unlike Step 2's public case), and render a small card with the `payment_link` (as a link) when present, next to the existing "Скопировать публичную ссылку" control.

- [ ] **Step 5: Surface the link on the public view page**

In `src/app/view/[token]/page.tsx`, alongside the existing `invoice`/`profile`/`bank` state, add a `kaspiPayment` state and fetch it in the existing `useEffect` via `fetch(`/api/kaspi/invoice-payment?token=${token}`).then(r => r.json())`, storing `data.payment`. Render a "Оплатить через Kaspi" button/QR block when `kaspiPayment` is present, visually next to wherever bank requisites are currently shown on this page.

- [ ] **Step 6: Manual verification**

Connect a Kaspi Cashier (Task 4/9), create and send an invoice to a test client email, confirm: (a) the email contains the Kaspi payment button, (b) `select * from kaspi_payment_requests where invoice_id = '...';` shows a row, (c) both `/invoice/[id]` and `/view/[token]` render the payment link, (d) paying it via a real Kaspi Pay app and running Task 8's cron flips the invoice to `paid` with no manual click.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/send-invoice/route.ts src/app/api/kaspi/invoice-payment/route.ts src/app/invoice/[id]/page.tsx src/app/view/[token]/page.tsx
git commit -m "auto-generate Kaspi payment link when an invoice is sent, surface it on both invoice views, auto-confirm on payment"
```

---

### Task 12: Full verification, env vars, push, memory

**Files:** none (verification-only)

- [ ] **Step 1: Full typecheck and test suite**

Run: `npx tsc --noEmit` — expect no errors.
Run: `npx vitest run` — expect all tests passing, including Task 1's new crypto tests.

- [ ] **Step 2: Full build**

Run: `npm run build` — confirm it succeeds and lists every new route (`/api/kaspi/connect/init`, `/api/kaspi/connect/verify`, `/api/kaspi/disconnect`, `/api/kaspi/pay`, `/api/cron/kaspi-poll`, `/profile/kaspi-pay`, `/profile/kaspi-pay/docs`).

- [ ] **Step 3: Add production env var**

Remind the user (do not attempt this yourself — it requires their Vercel dashboard access) to add `KASPI_SESSION_ENCRYPTION_KEY` (the value generated in Task 3) to Vercel's Production environment variables, then trigger a redeploy.

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Update memory**

Record in the project's memory system: this feature shipped, its architecture, the reference project it was ported from (with attribution), the unofficial/reverse-engineered risk accepted by the user, and any Minor findings deliberately left unfixed during review — following this session's established pattern for every prior feature (BCC-connect, Acquiring v1).

---

## Notes for whoever executes this plan

- Tasks 1–2 involve reading a third-party reverse-engineered protocol under an explicit risk acceptance already negotiated with the user earlier in this project's history. If you are a fresh subagent with no memory of that conversation, **stop and escalate to the controller** rather than proceeding — you are missing context essential to executing this responsibly.
- Every task after Task 2 is ordinary application code (routes, DB, UI) and can be safely delegated to a subagent once Tasks 1–2's crypto/client modules exist and are verified working end-to-end against Kaspi's real backend.
