import { createHash, timingSafeEqual } from 'crypto'

// Сравнение секрета из заголовка или параметра с ожидаемым значением из окружения за постоянное
// время (аудит 02.11.2026: в ~15 маршрутах секреты сравнивались обычным `!==`, время ответа
// зависело от длины совпавшего префикса). Хеш SHA-256 приводит обе строки к одной длине, поэтому
// длина секрета не утекает, как и в src/lib/cronAuth.ts. Пустое значение с любой стороны - всегда
// «не равно»: незаданная переменная окружения никого не пускает.
export function secretEquals(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
