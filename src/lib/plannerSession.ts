import crypto from 'crypto'

// Кука планировщика салона подписывается отдельным ключом от AI-агента
// (PLANNER_SESSION_SECRET, не AI_AGENT_ENCRYPTION_KEY) -- в кодовой базе уже
// заявлена конвенция "один ключ на функциональную область" (см. комментарий
// в src/lib/aiAgent/connection.ts). Форма один в один копирует
// src/lib/aiAgent/oauthState.ts: base64url JSON-пейлоад + HMAC-SHA256 +
// константно-временное сравнение + встроенный exp.
const COOKIE_TTL_MS = 24 * 60 * 60 * 1000 // 24 часа -- владелец не должен переоформлять вход каждый раз, когда открывает планшет на ресепшене

function getKey(): string {
  const key = process.env.PLANNER_SESSION_SECRET
  if (!key) throw new Error('PLANNER_SESSION_SECRET is not configured')
  return key
}

export type PlannerSessionPayload = { ownerProfileId: string; siteId: string }

export function signPlannerCookie(payload: PlannerSessionPayload): string {
  const json = JSON.stringify({ ...payload, exp: Date.now() + COOKIE_TTL_MS })
  const payloadB64 = Buffer.from(json).toString('base64url')
  const sig = crypto.createHmac('sha256', getKey()).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

export function verifyPlannerCookie(token: string): PlannerSessionPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expectedSig = crypto.createHmac('sha256', getKey()).update(payloadB64).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null

  let payload: PlannerSessionPayload & { exp: number }
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (Date.now() > payload.exp) return null
  return { ownerProfileId: payload.ownerProfileId, siteId: payload.siteId }
}
