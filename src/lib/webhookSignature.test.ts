import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { isValidSignature } from './webhookSignature'

describe('isValidSignature', () => {
  const secret = 'test-secret'
  const body = JSON.stringify({ event: 'payment.completed', merchant_order_id: 'user__|__pro' })

  function sign(payload: string, key: string) {
    return crypto.createHmac('sha256', key).update(payload).digest('hex')
  }

  it('accepts a correctly signed payload', () => {
    expect(isValidSignature(body, sign(body, secret), secret)).toBe(true)
  })

  it('rejects a missing signature', () => {
    expect(isValidSignature(body, null, secret)).toBe(false)
  })

  it('rejects a signature computed with the wrong secret', () => {
    expect(isValidSignature(body, sign(body, 'wrong-secret'), secret)).toBe(false)
  })

  it('rejects a signature for a tampered body', () => {
    const validSig = sign(body, secret)
    const tamperedBody = JSON.stringify({ event: 'payment.completed', merchant_order_id: 'attacker__|__pro' })
    expect(isValidSignature(tamperedBody, validSig, secret)).toBe(false)
  })

  it('rejects garbage non-hex signatures without throwing', () => {
    expect(isValidSignature(body, 'not-a-hex-signature', secret)).toBe(false)
  })
})
