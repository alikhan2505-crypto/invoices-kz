import { createHash, timingSafeEqual } from 'crypto'

// Единая проверка доступа для /api/cron/*. Vercel Cron шлёт заголовок
// `Authorization: Bearer ${CRON_SECRET}`; других заголовков наши маршруты
// никогда не принимали.
//
// Раньше каждый маршрут сравнивал строку напрямую: если CRON_SECRET пропадёт
// из окружения, шаблон превращался в литерал `Bearer undefined`, который мог
// отправить кто угодно, а обычное `!==` не постоянно по времени.
//  - секрет пустой или короче MIN_SECRET_LENGTH → никого не пускаем (закрыто);
//  - сравниваем SHA-256 от обеих строк через timingSafeEqual: буферы одной
//    длины всегда, длина секрета не утекает.
export const MIN_CRON_SECRET_LENGTH = 12

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return false

  const header = request.headers.get('authorization')
  if (!header) return false

  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  const actual = createHash('sha256').update(header).digest()
  return timingSafeEqual(expected, actual)
}
