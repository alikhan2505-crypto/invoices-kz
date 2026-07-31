import crypto from 'crypto'

const MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

export function signState(userId: string, secret: string): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const timestamp = Date.now().toString()
  const payload = `${userId}:${nonce}:${timestamp}`
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${signature}`).toString('base64url')
}

export function verifyState(state: string, secret: string): { userId: string } | null {
  let decoded: string
  try {
    decoded = Buffer.from(state, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const parts = decoded.split(':')
  if (parts.length !== 4) return null
  const [userId, nonce, timestamp, signature] = parts

  const payload = `${userId}:${nonce}:${timestamp}`
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null

  const age = Date.now() - Number(timestamp)
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null

  return { userId }
}
