import crypto from 'crypto'
import { getKey } from './connection'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes -- generous for a user to complete Instagram's own consent screen

// The Instagram OAuth callback (Task 6) is a real browser redirect from
// Meta, not our own fetch -- there's no Authorization bearer header to
// identify the user from, unlike every other route in this codebase. This
// signed, self-contained state param carries the user id through the
// redirect instead, HMAC'd with the same AI_AGENT_ENCRYPTION_KEY so it
// can't be forged (a forged state could otherwise let one user attach
// their own Instagram OAuth grant to a DIFFERENT user's agent).
export function createOAuthState(userId: string): string {
  const payload = JSON.stringify({ userId, nonce: crypto.randomBytes(8).toString('hex'), exp: Date.now() + STATE_TTL_MS })
  const payloadB64 = Buffer.from(payload).toString('base64url')
  const sig = crypto.createHmac('sha256', getKey()).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

export function verifyOAuthState(state: string): { userId: string } | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expectedSig = crypto.createHmac('sha256', getKey()).update(payloadB64).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null
  let payload: { userId: string; exp: number }
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (Date.now() > payload.exp) return null
  return { userId: payload.userId }
}
