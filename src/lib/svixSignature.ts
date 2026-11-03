import { createHmac, timingSafeEqual } from 'crypto'

// Подпись вебхуков Resend (Svix): заголовки svix-id, svix-timestamp, svix-signature. Подписывается строка
// `${id}.${timestamp}.${тело}` ключом из секрета вебхука (base64 после префикса whsec_) алгоритмом
// HMAC-SHA256; в svix-signature через пробел идут подписи вида `v1,<base64>` (несколько при смене ключа).
// Отдельная зависимость svix ради одной проверки не нужна.

const TOLERANCE_SEC = 5 * 60

export function verifySvixSignature(
  headers: Pick<Headers, 'get'>,
  rawBody: string,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatures = headers.get('svix-signature')
  if (!id || !timestamp || !signatures || !secret) return false

  // Старая или «из будущего» метка: повторная отправка перехваченного запроса.
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SEC) return false

  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
  if (key.length === 0) return false
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest()

  for (const part of signatures.split(' ')) {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) continue
    const given = Buffer.from(sig, 'base64')
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true
  }
  return false
}
