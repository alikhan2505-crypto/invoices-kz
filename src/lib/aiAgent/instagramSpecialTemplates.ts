// Особые строки шаблонов агента для Instagram (29.10.2026, просьба основателя
// на фоне рекламы «Отправить сообщение»). Включаются ТОЛЬКО наличием такой
// строки в ai_agent_reply_templates конкретного агента: у агента без них
// поведение обработчика прежнее.
//
// Механизм без DDL: особая строка -- обычный шаблон, у которого в
// trigger_words стоит служебный маркер с «@». Текстовый матчер на «@…» не
// срабатывает никогда (см. triggerMatch.ts), клиент не может «вызвать» такую
// строку, написав маркер текстом. В списке «Шаблоны» строки видны и
// редактируются как обычные (меняется только текст ответа).
//
//   @comment_ack      (channel comment) текст ПУБЛИЧНОГО ответа на комментарий с
//                     кодовым словом. Включает режим, но кодовыми словами
//                     считаются ТОЛЬКО триггеры DM-шаблонов с явным маркером
//                     @codeword (см. ниже): остальные DM-шаблоны (реакции на
//                     «огонь», «срочно» и т.п.) в комментариях не участвуют.
//                     Совпавший комментарий получает ссылку в директ (Instagram
//                     Private Reply), а публично -- этот короткий ответ.
//                     Режим работает только у агента, чей владелец имеет право
//                     instagram_business_manage_comments (instagramScopes.ts).
//   @codeword         маркер в DM-шаблоне: его триггеры (например «контрагент»,
//                     «^счёт») считаются кодовыми словами для комментариев.
//   @comment_default  (channel comment) публичный ответ на прочие комментарии
//                     вместо свободного ИИ-ответа («напишите слово в директ»).
//                     Не отправляется на ответы в ветке (parent_id) и на
//                     комментарии без букв и цифр; не чаще раза в сутки одному
//                     автору и не более 5 раз в час на аккаунт (см.
//                     commentDefaultAllowed). Он же говорится публично, если
//                     Private Reply не ушёл.
//   @attachment       (channel dm) ответ на сообщение с вложением БЕЗ текста
//                     (пересланный рилс/пост/сторис, share, видео, файл).
//   @attachment_image доп. маркер в той же строке: то же и для обычного ФОТО.
//                     Без него фото по-прежнему идёт в ИИ с распознаванием.
//   @reminder         (channel dm) ВКЛЮЧАЕТ напоминание через ~2 часа после ответа на
//                     КОНТРАГЕНТ, если человек не открыл ссылку и не писал; reply_text --
//                     текст напоминания (пусто = текст по умолчанию из кода). Вся логика
//                     и гарантии -- в dmReminder.ts. Выключить: удалить строку или
//                     заменить маркер на @reminder_off.

import { triggerMatches, isSpecialTrigger } from '@/lib/triggerMatch'
import { parseTemplateReplyText } from '@/lib/instagramButtonTemplate'

export const SPECIAL_TRIGGERS = {
  commentAck: '@comment_ack',
  commentDefault: '@comment_default',
  attachment: '@attachment',
  attachmentImage: '@attachment_image',
  codeword: '@codeword',
  reminder: '@reminder',
} as const

export interface TemplateRow {
  id: string
  trigger_words: string[]
  reply_text: string
  channel?: string | null
}

function norm(w: unknown): string {
  return typeof w === 'string' ? w.trim().toLowerCase() : ''
}

export function rowHasMarker(row: TemplateRow, marker: string): boolean {
  return Array.isArray(row.trigger_words) && row.trigger_words.some(w => norm(w) === marker)
}

// Первая (по порядку списка, т.е. по created_at) строка с маркером.
export function findSpecialTemplate(rows: TemplateRow[], marker: string): TemplateRow | null {
  for (const r of rows) if (rowHasMarker(r, marker)) return r
  return null
}

// Тексты строк-маркеров хранятся как есть; пустой текст = маркер выключен.
// Служебный блок @@button (ответ-карточка, instagramButtonTemplate.ts) сюда не
// попадает: публичные ответы, Private Reply и меню шлются только обычным текстом.
function textOf(row: TemplateRow | null): string | null {
  if (!row || typeof row.reply_text !== 'string') return null
  const t = parseTemplateReplyText(row.reply_text).plainText.trim()
  return t ? t : null
}

export type CommentPlan =
  | { kind: 'none' }
  | { kind: 'codeword'; ackText: string; dmText: string; templateId: string }

// rows -- ВСЕ шаблоны агента (любой channel). Режим включён только если есть
// строка @comment_ack. Кодовое слово = совпадение комментария с триггером
// DM-шаблона (channel === 'dm') С МАРКЕРОМ @codeword, тем же матчером
// triggerMatches со всеми режимами («=», «^», короткие, подстрока). DM-шаблоны
// без маркера и шаблоны на все каналы (channel null) не участвуют: на вторые
// комментарий и так отвечает обычный путь.
export function planCommentReply(rows: TemplateRow[], commentText: string): CommentPlan {
  const ack = textOf(findSpecialTemplate(rows.filter(r => r.channel == null || r.channel === 'comment'), SPECIAL_TRIGGERS.commentAck))
  if (!ack) return { kind: 'none' }
  const lower = commentText.toLowerCase()
  for (const r of rows) {
    if (r.channel !== 'dm' || !rowHasMarker(r, SPECIAL_TRIGGERS.codeword)) continue
    if (r.trigger_words.some(w => !isSpecialTrigger(w) && triggerMatches(lower, w))) {
      const dmText = textOf(r)
      if (!dmText) continue
      return { kind: 'codeword', ackText: ack, dmText, templateId: r.id }
    }
  }
  return { kind: 'none' }
}

// Публичный ответ на прочий комментарий вместо ИИ; null -- не настроен.
export function findCommentDefaultText(rows: TemplateRow[]): string | null {
  return textOf(findSpecialTemplate(rows.filter(r => r.channel == null || r.channel === 'comment'), SPECIAL_TRIGGERS.commentDefault))
}

// Защита публичного меню @comment_default от спама (повторяющиеся одинаковые
// публичные ответы -- сигнал для Instagram). Чистая функция: решение по данным.
export const COMMENT_DEFAULT_PER_AUTHOR_MS = 24 * 3600_000
export const COMMENT_DEFAULT_ACCOUNT_LIMIT = 5
export const COMMENT_DEFAULT_ACCOUNT_WINDOW_MS = 3600_000

export interface RecentCommentDefault { handle: string | null; createdAt: string }

export function commentDefaultAllowed(args: {
  isReply: boolean
  text: string
  handle: string
  recent: RecentCommentDefault[]
  now?: number
}): boolean {
  if (args.isReply) return false
  if (!/[\p{L}\p{N}]/u.test(args.text)) return false
  const now = args.now ?? Date.now()
  let inWindow = 0
  for (const r of args.recent) {
    const age = now - new Date(r.createdAt).getTime()
    if (Number.isNaN(age)) continue
    if (r.handle === args.handle && age < COMMENT_DEFAULT_PER_AUTHOR_MS) return false
    if (age < COMMENT_DEFAULT_ACCOUNT_WINDOW_MS) inWindow++
  }
  return inWindow < COMMENT_DEFAULT_ACCOUNT_LIMIT
}

export interface AttachmentRule {
  enabled: boolean
  // true -- меню и на обычное фото; false -- фото по-прежнему идёт в ИИ.
  images: boolean
  text: string | null
}

export function attachmentRuleFromRows(rows: TemplateRow[]): AttachmentRule {
  const row = findSpecialTemplate(rows.filter(r => r.channel == null || r.channel === 'dm'), SPECIAL_TRIGGERS.attachment)
  const text = textOf(row)
  if (!row || !text) return { enabled: false, images: false, text: null }
  return { enabled: true, images: rowHasMarker(row, SPECIAL_TRIGGERS.attachmentImage), text }
}

// Должно ли меню-ответ перехватить вложение этого типа. Голосовое всегда идёт
// в расшифровку (Whisper), как и раньше.
export function attachmentMenuApplies(rule: AttachmentRule, attachmentType: string | undefined | null): boolean {
  if (!rule.enabled) return false
  if (attachmentType === 'audio') return false
  if (attachmentType === 'image') return rule.images
  return true
}

export interface CommentCodewordDeps {
  sendPrivate: (text: string) => Promise<void>
  replyPublic: (text: string) => Promise<void>
  logOutbound: (text: string, kind: 'private' | 'public') => Promise<void>
  onError: (stage: 'private' | 'public', err: unknown) => Promise<void> | void
  // Публичный запасной ответ, если Private Reply не ушёл (@comment_default).
  fallbackPublicText: string | null
}

// Порядок важен: сначала Private Reply, потом публичный ответ -- чтобы публично
// не обещать ссылку, которая не дошла. Никогда не бросает.
export async function runCommentCodeword(
  plan: Extract<CommentPlan, { kind: 'codeword' }>,
  deps: CommentCodewordDeps,
): Promise<{ privateSent: boolean; publicSent: boolean }> {
  let privateSent = false
  try {
    await deps.sendPrivate(plan.dmText)
    privateSent = true
  } catch (err) {
    await deps.onError('private', err)
  }
  if (privateSent) {
    try { await deps.logOutbound(plan.dmText, 'private') } catch (err) { await deps.onError('private', err) }
  }

  const publicText = privateSent ? plan.ackText : deps.fallbackPublicText
  let publicSent = false
  if (publicText) {
    try {
      await deps.replyPublic(publicText)
      publicSent = true
    } catch (err) {
      await deps.onError('public', err)
    }
    if (publicSent) {
      try { await deps.logOutbound(publicText, 'public') } catch (err) { await deps.onError('public', err) }
    }
  }
  return { privateSent, publicSent }
}
