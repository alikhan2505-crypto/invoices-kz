// Разбор события messaging_postbacks Instagram (нажатие «готового вопроса» /
// Ice Breaker). Форма события по документации Meta (Webhooks for Instagram
// Messaging):
//   messaging: [{ sender: {id}, recipient: {id}, timestamp,
//                 postback: { mid, title, payload } }]
// Поле mid приходит с версии API v11 и выше; если его нет, идентификатор
// собирается из отправителя, времени и payload (одинаковое повторное событие
// даёт тот же идентификатор, и дедуп по external_id его отсекает).
// Префикс «pb:» -- метка для защиты от двойного ответа (webhookHandler.ts).

export const POSTBACK_ID_PREFIX = 'pb:'
const MAX_PAYLOAD_LEN = 1000

export interface PostbackIncoming {
  senderId: string
  externalId: string
  // Слово для конвейера DM.
  text: string
  // Что показывать в журнале диалога: подпись нажатой кнопки.
  loggedText: string
}

export function postbackToIncoming(messaging: any): PostbackIncoming | null {
  const postback = messaging?.postback
  const senderId = messaging?.sender?.id
  if (!postback || typeof senderId !== 'string' || !senderId) return null
  const payload = typeof postback.payload === 'string' ? postback.payload.trim().slice(0, MAX_PAYLOAD_LEN) : ''
  if (!payload) return null
  // Постбеки сценариев (кнопки шаблона) в этот путь не входят: их формат btn:...
  // не слово для клиента.
  if (payload.startsWith('btn:')) return null
  const title = typeof postback.title === 'string' ? postback.title.trim() : ''
  const mid = typeof postback.mid === 'string' && postback.mid ? postback.mid : ''
  const externalId = POSTBACK_ID_PREFIX + (mid || `${senderId}:${messaging.timestamp ?? ''}:${payload}`)
  return { senderId, externalId, text: payload, loggedText: title || payload }
}
