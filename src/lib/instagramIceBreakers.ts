// Чистая часть «готовых вопросов» Instagram (Ice Breakers), без сети.
// Формат (документация Meta, Ice Breakers): POST /<IG_ID>/messenger_profile
// { platform: 'instagram', ice_breakers: [{ call_to_actions: [{question, payload}] }] }
// Максимум 4 вопроса. Поле locale в документации Instagram необязательно (в примере
// оно есть только для набора на отдельный язык, например zh_CN); значение
// «default» -- правило Messenger Platform, для Instagram оно в документации не
// названо, поэтому не отправляется. Ice Breakers не показываются в десктопной
// версии Instagram.

import type { IceBreakerItem } from './instagram'

export const ICE_BREAKERS_MAX = 4
// Лимиты длины в документации Meta не названы; берём с запасом от известных
// значений Messenger (вопрос до 80, payload до 1000 символов).
export const ICE_BREAKER_QUESTION_MAX = 80
export const ICE_BREAKER_PAYLOAD_MAX = 1000

// Утверждённый набор для аккаунта invoices.kz (29.10.2026). payload -- кодовое
// слово, которое попадает в обычный конвейер DM как входящий текст, поэтому
// отвечает тот же шаблон, что и на слово, набранное руками.
export const DEFAULT_ICE_BREAKERS: IceBreakerItem[] = [
  { question: 'Проверить контрагента по БИН', payload: 'КОНТРАГЕНТ' },
  { question: 'Выставить счёт на оплату', payload: 'СЧЁТ' },
  { question: 'Налоги ИП на упрощёнке', payload: 'НАЛОГИ' },
  { question: 'Накладная на товар', payload: 'ТОВАР' },
]

export function validateIceBreakers(items: unknown): { ok: true; items: IceBreakerItem[] } | { ok: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'items must be a non-empty array' }
  if (items.length > ICE_BREAKERS_MAX) return { ok: false, error: `at most ${ICE_BREAKERS_MAX} ice breakers` }
  const out: IceBreakerItem[] = []
  for (const it of items) {
    const question = typeof it?.question === 'string' ? it.question.trim() : ''
    const payload = typeof it?.payload === 'string' ? it.payload.trim() : ''
    if (!question || !payload) return { ok: false, error: 'each item needs question and payload' }
    if ([...question].length > ICE_BREAKER_QUESTION_MAX) return { ok: false, error: `question too long (max ${ICE_BREAKER_QUESTION_MAX})` }
    if ([...payload].length > ICE_BREAKER_PAYLOAD_MAX) return { ok: false, error: 'payload too long' }
    out.push({ question, payload })
  }
  return { ok: true, items: out }
}

export function buildIceBreakersBody(items: IceBreakerItem[]) {
  const checked = validateIceBreakers(items)
  if (!checked.ok) throw new Error(checked.error)
  return {
    platform: 'instagram',
    ice_breakers: [{ call_to_actions: checked.items }],
  }
}
