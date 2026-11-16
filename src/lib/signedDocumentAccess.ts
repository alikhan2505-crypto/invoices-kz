import { timingSafeEqual } from 'crypto'

// Доступ к подписанному документу (/api/documents/[id]/[type]) по public_token самого
// документа (счёта или договора). Токен приходит в ?t=; пустой, не строка, другой длины
// или не совпавший - отказ. Если у документа токена нет (колонка пуста), открыть нельзя
// никому: пустое значение не должно совпадать с пустым запросом.
export function documentTokenMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false
  if (!provided || !expected || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}
