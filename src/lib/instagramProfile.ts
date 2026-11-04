// Имя собеседника в Instagram Direct. В вебхуке личного сообщения приходит только числовой id
// отправителя (IGSID), поэтому в «Диалогах» и «Свежих диалогах» клиент был числом вместо имени
// (аудит 02.11.2026, раздел 7). Профиль по IGSID отдаёт Graph API при праве
// instagram_business_manage_messages, а у собеседника, писавшего аккаунту, он доступен.

const GRAPH_API = 'https://graph.instagram.com/v21.0'
// Ответ клиенту ждёт этот запрос: дольше пары секунд ради имени не ждём.
const PROFILE_TIMEOUT_MS = 1500
const IGSID_RE = /^\d{5,25}$/

/**
 * Имя пользователя (username) или, если его нет, имя из профиля; null, если узнать не вышло
 * (нет права, пользователь скрыл профиль, сбой сети). Токен идёт заголовком, не в адресе.
 */
export async function fetchInstagramUserHandle(igsid: string, accessToken: string): Promise<string | null> {
  if (!IGSID_RE.test(igsid) || !accessToken) return null
  try {
    const res = await fetch(`${GRAPH_API}/${igsid}?fields=name,username`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
    })
    if (!res.ok) {
      // Без этой строки отказ по правам был бы немым: имя просто не появлялось бы. Токен и id в лог не пишем.
      const body = await res.json().catch(() => null) as { error?: { code?: unknown; type?: unknown } } | null
      console.warn('instagram profile lookup failed: status', res.status, 'code', body?.error?.code ?? '-', 'type', body?.error?.type ?? '-')
      return null
    }
    const data = await res.json() as { username?: unknown; name?: unknown }
    const username = typeof data.username === 'string' ? data.username.trim() : ''
    const name = typeof data.name === 'string' ? data.name.trim() : ''
    return (username || name || '').slice(0, 80) || null
  } catch {
    return null
  }
}
