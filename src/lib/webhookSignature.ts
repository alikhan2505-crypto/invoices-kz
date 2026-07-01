import crypto from 'crypto'

// HMAC-SHA256 verification per xpayment.kz webhook spec (X-xPayment-Signature header, hex, raw body bytes)
export function isValidSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)
}
