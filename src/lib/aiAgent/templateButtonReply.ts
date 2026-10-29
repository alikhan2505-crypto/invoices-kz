// Отправка шаблонного ответа в директ Instagram: карточкой с кнопкой, если строка
// шаблона помечена блоком @@button (формат -- instagramButtonTemplate.ts), иначе
// обычным текстом. Чистая логика с внедряемой отправкой ради теста.
//
// Гарантии:
//  - клиент не остаётся без ответа: если карточку отправить не удалось, ТОТ ЖЕ
//    ответ уходит обычным текстом (reply_text -- прежний текст со ссылкой);
//  - при успехе карточки текст НЕ отправляется (никаких дублей);
//  - в журнал идёт читаемый текст: у карточки -- заголовок, подзаголовок и ссылка
//    кнопки, не JSON; у запасного текста -- сам текст.
//
// Десктоп: документация Meta -- generic template на десктопе не поддержан. Это не
// ошибка API (запасной текст не включится), поэтому карточка по умолчанию идёт
// только на нажатие ice breaker (мобильное приложение), см. instagramButtonTemplate.ts.
//
// Неопределённый случай: карточка не получила ответа от Meta (таймаут, обрыв
// сети, status 0) -- она могла и дойти. Всё равно отправляем текст: входящее уже
// записано в журнал и повторно этот вебхук не обработается, поэтому молчание
// было бы потерей ответа навсегда, а худший исход текста -- второе сообщение с той
// же ссылкой (безобидно). Реально такое бывает редко: при обрыве сети не дойдёт
// и текст. В лог такой случай идёт с пометкой «no response», чтобы дубли были видны.

import { buttonTemplateText, type ButtonTemplate } from '@/lib/instagramButtonTemplate'

export interface TemplateReplyDeps {
  sendButton: (button: ButtonTemplate) => Promise<void>
  sendText: (text: string) => Promise<void>
  /** Карточка не ушла, сейчас уйдёт запасной текст. Не должна бросать. */
  onButtonFailed: (err: unknown) => Promise<void> | void
}

export interface TemplateReplyResult {
  via: 'button' | 'text'
  /** Что записать в журнал исходящих. */
  loggedText: string
}

/**
 * Бросает только если не ушёл и обычный текст (как раньше бросал sendDirectMessage):
 * вызывающий ловит это тем же catch, что и раньше.
 */
export async function sendTemplateReply(
  reply: { reply_text: string; button: ButtonTemplate | null; cardOnTyped?: boolean },
  deps: TemplateReplyDeps,
  /** Ответ на нажатие ice breaker (виден только в мобильном приложении). */
  fromPostback = false,
): Promise<TemplateReplyResult> {
  // Карточка не поддержана в десктопном Instagram, а Meta принимает её с HTTP 200
  // и запасной текст там не сработает. Поэтому на набранное руками слово карточку
  // шлём, только если строка явно разрешила это (typed: yes).
  if (reply.button && (fromPostback || reply.cardOnTyped)) {
    try {
      await deps.sendButton(reply.button)
      return { via: 'button', loggedText: buttonTemplateText(reply.button) }
    } catch (err) {
      try { await deps.onButtonFailed(err) } catch { /* запасной текст важнее лога */ }
    }
  }
  await deps.sendText(reply.reply_text)
  return { via: 'text', loggedText: reply.reply_text }
}
