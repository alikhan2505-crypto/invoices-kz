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
