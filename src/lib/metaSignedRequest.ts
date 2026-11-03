import { createHmac, timingSafeEqual } from 'crypto'

// signed_request от Meta (обратные вызовы «Отзыв доступа» и «Запрос удаления данных»): строка
// `<подпись>.<данные>`, обе части base64url; подпись - HMAC-SHA256 от второй части ключом app secret.
// Приложений Meta у нас два (Instagram и WhatsApp), у каждого свой секрет: подходит любой из заданных.

const b64urlToBuffer = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

export interface MetaSignedPayload {
  /** id пользователя в приложении (для Instagram: id профессионального аккаунта). */
  userId: string
  algorithm: string
}

export function parseMetaSignedRequest(signedRequest: unknown, appSecrets: Array<string | undefined>): MetaSignedPayload | null {
  if (typeof signedRequest !== 'string' || signedRequest.length > 4096) return null
  const parts = signedRequest.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const [sigPart, payloadPart] = parts

  const given = b64urlToBuffer(sigPart)
  const verified = appSecrets.some(secret => {
    if (!secret) return false
    const expected = createHmac('sha256', secret).update(payloadPart).digest()
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!verified) return null

  try {
    const data = JSON.parse(b64urlToBuffer(payloadPart).toString('utf8')) as { user_id?: unknown; algorithm?: unknown }
    if (typeof data.algorithm !== 'string' || data.algorithm.toUpperCase() !== 'HMAC-SHA256') return null
    const userId = typeof data.user_id === 'number' ? String(data.user_id) : data.user_id
    if (typeof userId !== 'string' || !/^\d{1,30}$/.test(userId)) return null
    return { userId, algorithm: data.algorithm }
  } catch {
    return null
  }
}
