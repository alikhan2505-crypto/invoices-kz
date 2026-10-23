import crypto from 'crypto'

const WIDGET_KEY_PATTERN = /^wgt_[0-9a-f]{24}$/

export function generateWidgetKey(): string {
  return 'wgt_' + crypto.randomBytes(12).toString('hex')
}

export function isValidWidgetKeyFormat(key: string): boolean {
  return WIDGET_KEY_PATTERN.test(key)
}

// A script tag's data-key is visible to anyone who views the seller's page
// source (the normal, accepted trust model for any embeddable chat widget --
// Intercom/Crisp work the same way), so this limit protects against
// wallet-draining spam, not identity spoofing.
export const WIDGET_MESSAGE_RATE_LIMIT = 10
export const WIDGET_MESSAGE_RATE_WINDOW_MS = 60_000

export function exceedsRateLimit(recentMessageCount: number): boolean {
  return recentMessageCount >= WIDGET_MESSAGE_RATE_LIMIT
}

// Second, coarser limit scoped to the whole agent rather than one visitor --
// unlike Telegram/WhatsApp/Instagram, a website visitorId costs an attacker
// nothing to fabricate fresh on every request (it's a client-generated
// value, never tied to a real platform account), so the per-visitor limit
// above is trivially bypassed by rotating it. This caps the worst case
// while still comfortably covering many genuine simultaneous visitors.
export const WIDGET_AGENT_MESSAGE_RATE_LIMIT = 60

export function exceedsAgentRateLimit(recentMessageCount: number): boolean {
  return recentMessageCount >= WIDGET_AGENT_MESSAGE_RATE_LIMIT
}

// Аудит 24.10.2026 (webhooks-cron-2 / abuse-cost-9 / billing-logic-4): widgetKey
// публичен, visitorId задаёт клиент, а каждый ответ стоит продавцу 5 ₸ и вызов
// модели. Поверх лимитов выше добавлены лимит по IP и суточный потолок на агента
// (счётчики -- widgetLimiter.ts), а вход ужат до разумных размеров.
//
// Посетителей за одним NAT (офис, мобильный оператор) может быть много, поэтому
// лимит по IP вдвое выше лимита одного посетителя, но достаточен, чтобы один
// адрес не заменял собой ротацию visitorId.
export const WIDGET_IP_RATE_LIMIT = 20
export const WIDGET_IP_DAILY_LIMIT = 500
// Потолок убытка продавца за сутки от публичного ключа: 2000 * 5 ₸ = 10 000 ₸.
export const WIDGET_AGENT_DAILY_LIMIT = 2000
export const WIDGET_MAX_TEXT_LENGTH = 2000
// Тело запроса: текст до 2000 символов + служебные поля; с запасом на \uXXXX-
// экранирование кириллицы. Больше -- заведомо не живой посетитель.
export const WIDGET_MAX_BODY_CHARS = 16_384

// widget.js отдаёт crypto.randomUUID() либо запасной вариант "<ms><hex>"; на
// размер и алфавит смотрим, а не на строгий uuid, чтобы не потерять второй.
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export function isValidVisitorId(id: string): boolean {
  return VISITOR_ID_PATTERN.test(id)
}
