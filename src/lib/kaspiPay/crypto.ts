// Protocol ported from tapter-dev/kaspi-pos-automation (MIT license), adapted
// to this codebase's conventions. IMPORTANT DEVIATION from the reference
// project: it generates ONE identity keypair + device fingerprint for its
// whole process lifetime (persisted to keypair.json/device.json) and reuses
// it for every phone number ever paired. That is fine for a single-operator
// tool but would make every invoices.kz customer look like the same
// physical device to Kaspi's fraud detection. generateIdentity() here is
// called ONCE PER CONNECTION (at connect time) instead, and every value it
// returns is persisted per-row in kaspi_connections, never shared.
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
