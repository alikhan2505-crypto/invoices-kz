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
import { deriveGeoLocation, deriveClientIp } from './deviceContext'

// Kaspi has refused THIS connection's credentials outright (401/403): the
// paired device was removed from the customer's Kaspi Pay app, or the
// Cashier role was revoked. Nothing on our side can recover from that — the
// customer has to pair again — so callers treat it as terminal, exactly like
// the BCC cron treats BccConsentError. Every other failure mode (network
// error, timeout, Kaspi 5xx, unparseable body) stays an ordinary Error and
// must be retried, never used to park a connection that would have worked
// again on the next run.
export class KaspiAuthError extends Error {}

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

// `phoneNumber` must already be a bare digit string (`77071234567`) — see
// normalizeKzPhone in ./phone, applied by the route before we get here.
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

  // Kaspi's EnterPhoneNumber step specifically rejects the 11-digit
  // `7XXXXXXXXXX` form with a business error (UserPhoneNumberDoesNotBelong-
  // ToAnyOperator) even for real, active Cashier numbers — confirmed live
  // against entrance-pay.kaspi.kz after exhausting every other variable
  // (IP, TLS fingerprint, device fingerprint, timing, the number itself).
  // Only this one wire field wants the bare 10-digit subscriber number; the
  // 11-digit form is still what's normalized, stored, and displayed
  // everywhere else in this codebase (see normalizeKzPhone in ./phone).
  const entrancePhoneNumber = phoneNumber.replace(/^7/, '')

  const phoneReferer = `${KASPI_ENTRANCE_URL}/process/universal-enter-phone-number?pId=${processId}&firstPage=KPUniversalEnterPhoneNumber`
  const { json: phoneBody } = await entranceStep({
    meta: { pId: processId, sn: 'EnterPhoneNumber' },
    data: { phoneNumber: entrancePhoneNumber },
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
    // The phone's own LAN address. Kept (it is part of the signed X-SH list,
    // so dropping it would change the signature base string for a protocol
    // we cannot re-test against Kaspi), but derived per connection instead of
    // being the same literal for every customer — see deviceContext.ts.
    'X-Kb-Client-Ip': deriveClientIp(identity.deviceId),
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
  // Per connection, not per request: a real POS terminal sits still, so the
  // same connection must always report the same coordinates — but every
  // business reporting the exact same Almaty point is itself a fraud signal.
  const { latitude, longitude } = deriveGeoLocation(connection.deviceId)
  const payload = JSON.stringify({
    PaymentAmount: params.amount,
    DeviceInterface: 'Pos',
    Latitude: latitude,
    Longitude: longitude,
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

export async function createInvoiceByPhone(
  connection: KaspiConnection,
  params: { phoneNumber: string, amount: number, comment?: string }
): Promise<{ operationId: string }> {
  const url = `${KASPI_QRPAY_URL}/v01/remote/create`
  const payload = JSON.stringify({
    PhoneNumber: params.phoneNumber,
    Amount: params.amount,
    Comment: params.comment || '',
  })
  const headers = { ...buildSignedHeaders(url, connection, payload), 'Content-Type': 'application/json' }
  const res = await fetch(url, { method: 'POST', headers, body: payload })
  const json = await res.json()
  const d = json.Data
  if (!d?.QrOperationId) throw new Error('Kaspi remote/create failed: ' + JSON.stringify(json))
  return { operationId: String(d.QrOperationId) }
}

export interface KaspiHistoryOperation {
  id: string
  orderNumber: string
  regDate: string
  amount: number
  clientName: string | null
  direction: 'in' | 'out'
  // Raw OperationType, kept alongside the derived `direction` rather than
  // discarded -- without it, a future correction to the in/out mapping (once
  // a real refund sample is observed) would have no way to re-derive past
  // rows' true direction; every operation synced under the old mapping
  // would stay permanently mislabeled.
  operationType: number | null
}

// Kaspi's real transaction-history feed -- not just what we ourselves
// created via createPayment/createInvoiceByPhone, but every operation on
// the connected Cashier account. StatementPeriodCode: 2 returns a rolling
// multi-day window (confirmed live) rather than just endDate's single day,
// so a daily sync never has a gap between runs.
export async function getOperationsHistory(
  connection: KaspiConnection,
  params: { endDate: string }
): Promise<KaspiHistoryOperation[]> {
  const url = `${KASPI_QRPAY_URL}/v02/history/operations`
  const payload = JSON.stringify({ EndDate: params.endDate, LastTransactionDate: '', StatementPeriodCode: 2 })
  const headers = { ...buildSignedHeaders(url, connection, payload), 'Content-Type': 'application/json' }
  const res = await fetch(url, { method: 'POST', headers, body: payload })
  const json = await res.json()
  const dailySets = json.Data?.DailySets
  if (!Array.isArray(dailySets)) throw new Error('Kaspi history/operations failed: ' + JSON.stringify(json))

  const operations: KaspiHistoryOperation[] = []
  for (const day of dailySets) {
    for (const op of day.Operations || []) {
      operations.push({
        id: String(op.Id),
        orderNumber: op.OrderNumber,
        regDate: op.OrderRegDate,
        // Amount arrives as a pre-formatted display string (" 100 ₸", or
        // "10 000 ₸" for larger amounts where the space is a thousands
        // separator) -- stripping everything but digits handles both.
        amount: Number(String(op.Amount).replace(/[^\d]/g, '')),
        clientName: op.ClientShortName || null,
        // OperationType's exact value-to-direction mapping is not fully
        // confirmed (no live refund/outgoing sample was ever observed).
        // Fail-safe direction, NOT a best-effort one: only the one
        // confirmed-live value (0, a real sale) is trusted as 'in' --
        // literally everything else (including any future OperationType
        // this codebase hasn't seen yet, which could be a refund) is
        // treated as 'out' and excluded from invoice-matching/commission
        // by matchOperation's own direction guard. Do not weaken this to
        // "default in, treat only a confirmed value as out" -- that
        // ordering would auto-charge commission on an unconfirmed
        // operation type (e.g. a real refund) the first time Kaspi sends
        // one, which is the exact failure this guards against.
        direction: op.OperationType === 0 ? 'in' : 'out',
        operationType: typeof op.OperationType === 'number' ? op.OperationType : null,
      })
    }
  }
  return operations
}

const QR_PAID = new Set(['Processed'])
const QR_FAILED = new Set([
  'CancelledByUser', 'NotConfirmedByUser', 'CancelledByExternalSource', 'ProcessingFailed',
  'Rejected', 'InsufficientFunds', 'InsufficientFundsError', 'Error',
  'IrisSrcBlockCode1', 'IrisSrcBlockCode3', 'IrisSrcBlockCode9',
  'IrisDestBlockCode3', 'IrisDestBlockCode5', 'IrisDestBlockCode7', 'IrisDestBlockCode10',
  // A phone push (remote/create) is a different Kaspi flow end-to-end and
  // uses its own status vocabulary, not the QR-scan strings above -- caught
  // live 2026-09-05 via the diagnostic logging below: declining a pushed
  // subscription payment in the Kaspi app reported exactly this, not any of
  // the QR strings, so it silently looped as 'pending' forever until this
  // was added. The in-flight counterpart is 'RemotePaymentCreated' (handled
  // below, parallel to 'QrTokenCreated'); no evidence yet for what a PAID
  // remote push reports, since none has been observed live -- if it turns
  // out not to be 'Processed' like a QR, that path has the same silent-loop
  // risk and the logging below is what will catch it.
  'RemotePaymentRejected',
])
const QR_EXPIRED = new Set(['QrTokenDiscarded', 'Expired'])
// 'Wait' is Kaspi's own signal that the customer has already opened/scanned
// the QR and is now looking at the confirmation screen in their app --
// distinct from 'QrTokenCreated' (nobody has touched it yet), confirmed via
// the reference project this module was ported from (src/polling.js there
// groups both under one "intermediate" bucket, but tracks them as separate
// literal status strings). Surfacing this separately lets callers show a
// live "customer is confirming" state and, crucially, avoid ever treating a
// QR as safe to replace while a real confirmation might be in flight.
const QR_SCANNING = new Set(['Wait'])

export async function checkStatus(
  connection: KaspiConnection,
  operationId: string
): Promise<{ status: 'pending' | 'paid' | 'expired' | 'failed' | 'scanning' }> {
  const url = `${KASPI_QRPAY_URL}/v02/kaspi-qr/status?qrOperationId=${operationId}`
  const res = await fetch(url, { headers: buildSignedHeaders(url, connection) })

  // 401/403 = Kaspi refused this connection's signed request, not "the
  // payment isn't done yet". Without this the poller read the missing
  // Data.Status off the error body and reported 'pending' forever, so a
  // connection whose device was unpaired on the Kaspi side stayed 'active'
  // and its payments were polled indefinitely with no signal anywhere. Same
  // precision as the BCC cron: only these two statuses mean the credentials
  // themselves were rejected; 429/5xx/timeouts stay transient below.
  if (res.status === 401 || res.status === 403) {
    throw new KaspiAuthError(`Kaspi rejected this connection's credentials: ${res.status}`)
  }

  const json = await res.json()
  const status: string | undefined = json.Data?.Status

  if (!status) return { status: 'pending' }
  if (QR_PAID.has(status)) return { status: 'paid' }
  if (QR_EXPIRED.has(status)) return { status: 'expired' }
  if (QR_FAILED.has(status)) return { status: 'failed' }
  if (QR_SCANNING.has(status)) return { status: 'scanning' }
  // 'QrTokenCreated' (QR minted, untouched) and 'RemotePaymentCreated' (push
  // sent, untouched) are the two confirmed-benign in-flight values -- caught
  // live 2026-09-05 alongside 'RemotePaymentRejected' above. Anything else is
  // still logged rather than silently treated as pending: QR_FAILED/
  // QR_EXPIRED/QR_PAID were each built from strings actually observed for
  // their flow, and a phone push's own PAID string has never been observed
  // (no live remote payment has completed yet) -- if it isn't 'Processed'
  // like a QR, this is what will catch it instead of a payment silently
  // looping as 'pending' forever with the money already taken.
  if (status !== 'QrTokenCreated' && status !== 'RemotePaymentCreated') {
    console.error('Kaspi checkStatus: unrecognized status', JSON.stringify(status), 'for operation', operationId, '-- treating as pending')
  }
  return { status: 'pending' }
}
