// Жива ли связь с номером входа через WhatsApp. Номер основателя подключён в режиме «приложение + API»:
// если приложение WhatsApp Business на телефоне не открывать 13-14 дней, Meta отвязывает номер от API,
// и вход молча перестаёт отвечать. Кнопку при этом надо прятать, а основателю сообщить.

import { loginConfig, type WhatsAppLoginConfig } from './helpers'

export type WhatsAppLoginHealth =
  | { state: 'off' }
  | { state: 'ok' }
  | { state: 'down'; reason: string }

/** Состояния номера по данным Meta (поле status), при которых отвечать человеку уже нельзя. */
const DEAD_STATUSES = new Set(['DISCONNECTED', 'DELETED', 'BANNED', 'MIGRATED'])

export interface HealthDeps {
  cfg?: WhatsAppLoginConfig | null
  /** Активное подключение номера (токен расшифрован) или null. */
  loadConnection: (phoneNumberId: string) => Promise<{ accessToken: string } | null>
  fetchImpl?: typeof fetch
}

export async function checkWhatsAppLoginHealth(deps: HealthDeps): Promise<WhatsAppLoginHealth> {
  const cfg = deps.cfg === undefined ? loginConfig() : deps.cfg
  if (!cfg) return { state: 'off' }

  let conn: { accessToken: string } | null = null
  try {
    conn = await deps.loadConnection(cfg.phoneNumberId)
  } catch (e) {
    // База недоступна: это не доказательство обрыва связи, не прячем кнопку из-за чужого сбоя.
    console.error('whatsapp login health: connection read failed:', e instanceof Error ? e.message : e)
    return { state: 'ok' }
  }
  if (!conn) return { state: 'down', reason: 'нет активного подключения номера (токен истёк или подключение снято)' }

  try {
    const res = await (deps.fetchImpl ?? fetch)(`https://graph.facebook.com/v25.0/${encodeURIComponent(cfg.phoneNumberId)}?fields=status`, {
      headers: { Authorization: `Bearer ${conn.accessToken}` },
      signal: AbortSignal.timeout(6_000),
    })
    const body = await res.json().catch(() => null) as { status?: string; error?: { code?: number } } | null
    // Недействительный токен Meta отдаёт как 401 или как ошибку OAuth с кодом 190 (часто с HTTP 400).
    // Прочие отказы (права, 5xx, лимиты) не доказательство обрыва: кнопку не прячем.
    if (res.status === 401 || body?.error?.code === 190) return { state: 'down', reason: 'Meta отклонила токен номера' }
    if (!res.ok) return { state: 'ok' }
    const status = typeof body?.status === 'string' ? body.status.toUpperCase() : ''
    if (DEAD_STATUSES.has(status)) return { state: 'down', reason: `Meta сообщает статус номера ${status}` }
    return { state: 'ok' }
  } catch (e) {
    console.error('whatsapp login health: graph probe failed:', e instanceof Error ? e.message : e)
    return { state: 'ok' }
  }
}

export function healthAlertText(reason: string): string {
  return `⚠ Вход через WhatsApp не работает: ${reason}.\nКнопка на странице входа скрыта. Что сделать: откройте WhatsApp Business на телефоне с номером входа; если не помогло, переподключите номер в «ИИ-агент → Каналы → WhatsApp».`
}
