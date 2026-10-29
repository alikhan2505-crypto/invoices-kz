// Ответ-КАРТОЧКА с кнопкой в директе Instagram (29.10.2026): вместо текста с
// голой ссылкой уходит шаблон Instagram Messaging API типа generic -- заголовок,
// подзаголовок и кнопка web_url. Тексты берутся из строки ai_agent_reply_templates,
// миграция БД не нужна: пометка живёт ВНУТРИ reply_text.
//
// ТОЧНЫЙ ФОРМАТ reply_text строки «с кнопкой»:
//
//   <обычный текст ответа -- он же ЗАПАСНОЙ: уходит, если карточку отправить не
//   удалось, и по нему же отвечают Telegram/WhatsApp/сайт/комментарии>
//
//   @@button
//   title: Проверка по БИН
//   subtitle: Неблагонадёжность, ликвидация, налоговый долг, НДС. 3 проверки в квартал
//   button: Открыть проверку
//   url: https://invoices.kz/go/dm-kontragent-btn
//
// По умолчанию карточка уходит ТОЛЬКО на нажатие «готового вопроса» (ice breaker),
// а на слово, набранное руками, -- обычным текстом. Причина: документация Meta
// (Generic Template, Limitations): «This feature is currently not available on
// desktop». Meta принимает карточку с HTTP 200 даже для получателя с десктопа, и
// запасной текст не включится (ошибки API нет), клиент остался бы без ответа.
// Ice breaker виден только в мобильном приложении, поэтому карточка там читается.
// Когда карточку проверят на десктопе и в тестовом аккаунте, в блок добавляют
// строку «typed: yes» -- тогда карточка уходит и на набранное слово.
//
// Правила:
//  - служебный блок начинается строкой, состоящей только из «@@button» (регистр не
//    важен), и идёт до конца текста; всё ДО него -- обычный текст;
//  - ключи title / subtitle / button / url (и необязательный typed: yes), по одному в строке «ключ: значение»
//    (делится по первому двоеточию, поэтому в url двоеточие не мешает);
//  - клиент блок НИКОГДА не видит: parseTemplateReplyText отдаёт чистый текст без
//    блока, а при любой ошибке в блоке (нет ключа, слишком длинно, url не https)
//    карточка просто не используется, уходит обычный текст;
//  - если текста до блока нет, запасной текст собирается из карточки.
// Строка без «@@button» не меняется ни на один символ.
//
// Лимиты. Документация Meta (Instagram API with Instagram Login, Messaging API,
// Generic Template): title 80 символов, subtitle 80 символов, до 10 элементов
// (мы шлём один), до 3 кнопок на элемент (мы шлём одну), типы кнопок только
// postback и web_url; у элемента обязателен title и ещё хотя бы одно свойство.
// Длина названия кнопки и требование https к url в документации Instagram НЕ
// заданы (в примерах https) -- берём осторожные значения: 20 символов (лимит
// кнопок Messenger Platform) и только https.

export const BUTTON_BLOCK_MARKER = '@@button'

export const IG_TEMPLATE_LIMITS = {
  title: 80,
  subtitle: 80,
  buttonTitle: 20,
} as const

export interface ButtonTemplate {
  title: string
  subtitle: string
  buttonTitle: string
  url: string
}

export interface ParsedTemplateText {
  /** Текст без служебного блока: то, что можно показать клиенту / отправить обычным сообщением. */
  plainText: string
  /** Готовая к отправке карточка или null (нет блока либо блок некорректен). */
  button: ButtonTemplate | null
  /** В тексте был блок @@button (даже если он оказался некорректным). */
  hasBlock: boolean
  /** В блоке стоит «typed: yes»: карточка разрешена и на слово, набранное руками (по умолчанию нет). */
  cardOnTyped: boolean
}

// Длину считаем в единицах UTF-16 (.length): для эмодзи это строже, чем в
// символах, то есть запас в нашу пользу.
function validButton(fields: Record<string, string>): ButtonTemplate | null {
  const title = (fields.title ?? '').trim()
  const subtitle = (fields.subtitle ?? '').trim()
  const buttonTitle = (fields.button ?? '').trim()
  const url = (fields.url ?? '').trim()
  if (!title || !buttonTitle || !url) return null
  if (title.length > IG_TEMPLATE_LIMITS.title) return null
  if (subtitle.length > IG_TEMPLATE_LIMITS.subtitle) return null
  if (buttonTitle.length > IG_TEMPLATE_LIMITS.buttonTitle) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:' || u.username || u.password) return null
  return { title, subtitle, buttonTitle, url }
}

/** Читаемый текст карточки для журнала и запасного ответа: заголовок, подзаголовок, ссылка. */
export function buttonTemplateText(b: ButtonTemplate): string {
  return [b.title, b.subtitle, b.url].filter(Boolean).join('\n')
}

export function parseTemplateReplyText(raw: string): ParsedTemplateText {
  if (typeof raw !== 'string' || !raw.toLowerCase().includes(BUTTON_BLOCK_MARKER)) {
    return { plainText: raw, button: null, hasBlock: false, cardOnTyped: false }
  }
  const lines = raw.split(/\r?\n/)
  const at = lines.findIndex(l => l.trim().toLowerCase() === BUTTON_BLOCK_MARKER)
  if (at < 0) return { plainText: raw, button: null, hasBlock: false, cardOnTyped: false }

  const fields: Record<string, string> = {}
  for (const line of lines.slice(at + 1)) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const key = line.slice(0, i).trim().toLowerCase()
    if (key in fields) continue
    fields[key] = line.slice(i + 1).trim()
  }
  const button = validButton(fields)
  let plainText = lines.slice(0, at).join('\n').trim()
  if (!plainText && button) plainText = buttonTemplateText(button)
  const cardOnTyped = /^(yes|true|1|да)$/i.test((fields.typed ?? '').trim())
  return { plainText, button, hasBlock: true, cardOnTyped: !!button && cardOnTyped }
}

/** Тело поля message для POST /<IG_ID>/messages (шаблон generic, один элемент, одна кнопка). */
export function buildButtonTemplateMessage(b: ButtonTemplate) {
  return {
    attachment: {
      type: 'template' as const,
      payload: {
        template_type: 'generic' as const,
        elements: [
          {
            title: b.title,
            ...(b.subtitle ? { subtitle: b.subtitle } : {}),
            buttons: [{ type: 'web_url' as const, url: b.url, title: b.buttonTitle }],
          },
        ],
      },
    },
  }
}
