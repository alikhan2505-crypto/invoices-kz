// Токены шагов подключения магазина Kaspi (otpToken, resumeToken, sessionToken), которые уходят в браузер и
// возвращаются обратно. Раньше это был открытый base64 с куками входа в кабинет Kaspi: чужой токен подошёл бы любому
// вошедшему человеку, живого срока годности не было (аудит 14.11.2026). Теперь токен зашифрован ключом сервера
// (AES-256-GCM, тот же KASPI_SHOP_ENCRYPTION_KEY, что у сохранённых сессий), привязан к человеку и виду шага и живёт
// ограниченное время. Для браузера это по-прежнему непрозрачная строка.

import { decryptAtRest, encryptAtRest } from '@/lib/kaspiPay/crypto'

// Тот же ключ, что у сохранённых сессий (connection.ts), читается здесь напрямую: модуль не тянет за собой базу.
function getKey(): string {
  const key = process.env.KASPI_SHOP_ENCRYPTION_KEY
  if (!key) throw new Error('KASPI_SHOP_ENCRYPTION_KEY is not configured')
  return key
}

export type ConnectTokenKind = 'otp' | 'session'

/** Токен шага «код из SMS» живёт 15 минут (Kaspi сам гасит код раньше), токен выбора магазина 30 минут. */
export const CONNECT_TOKEN_TTL_MS: Record<ConnectTokenKind, number> = { otp: 15 * 60_000, session: 30 * 60_000 }

interface Sealed { u: string; k: ConnectTokenKind; e: number; p: string }

export function sealConnectToken(userId: string, kind: ConnectTokenKind, plain: string, now = Date.now()): string {
  const body: Sealed = { u: userId, k: kind, e: now + CONNECT_TOKEN_TTL_MS[kind], p: plain }
  return encryptAtRest(JSON.stringify(body), getKey())
}

/** Исходный токен или null: чужой, другого вида, просроченный, подделанный. */
export function openConnectToken(userId: string, kind: ConnectTokenKind, sealed: unknown, now = Date.now()): string | null {
  if (typeof sealed !== 'string' || !sealed || sealed.length > 20_000) return null
  try {
    const body = JSON.parse(decryptAtRest(sealed, getKey()).toString('utf8')) as Partial<Sealed>
    if (body.u !== userId || body.k !== kind || typeof body.e !== 'number' || body.e <= now || typeof body.p !== 'string') return null
    return body.p
  } catch {
    return null // не расшифровалось: подделка или токен прежнего вида
  }
}
