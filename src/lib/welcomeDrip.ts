import { createHmac } from 'crypto'

// Подпись ссылки отписки welcome-цепочки. Ключом служит service-role key:
// он серверный, есть во всех окружениях и не требует заводить ещё один
// секрет ради одной ссылки. Появится второй потребитель подписей — вынести
// в отдельный ключ по конвенции «один выделенный ключ на область».
export function unsubToken(userId: string): string {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`unsub|${userId}`)
    .digest('base64url')
    .slice(0, 32)
}
