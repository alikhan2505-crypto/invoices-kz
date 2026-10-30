// Своя минимальная аналитика бесплатных инструментов (15.10.2026): Vercel Web
// Analytics у проекта не включён, и все track() из @vercel/analytics ничего
// не записывают. События пишутся в public.tool_events (миграция
// supabase/migrations/tool_events.sql) через POST /api/tools/event, а
// читаются на /admin → вкладка «Инструменты».
//
// Этот файл — общий словарь клиента и сервера, без зависимостей от браузера
// или Supabase. Списки совпадают с CHECK-ограничениями таблицы: новое событие
// или инструмент надо добавить и здесь, и в миграции.

// 29.10.2026: три события формы (автоподстановка по БИН, раскрытие «Дополнительно»,
// подстановка запомненных реквизитов) - чтобы мерить конверсию view -> doc.
// Без supabase/migrations/tool_events_form.sql строки с ними не пишутся (204, сбой в логе).
//
// 30.10.2026: шаги страницы входа (login_*, tool 'none') и клик «Следить за БИН»
// (tool_watch_click) - чтобы увидеть, где теряются люди между «нажал регистрацию»
// и «получил письмо». Без supabase/migrations/tool_events_login.sql такие строки
// тоже не пишутся (204, сбой в логе).
export const TOOL_EVENT_NAMES = [
  'view', 'doc', 'cta', 'limit', 'lead', 'signup',
  'tool_form_autofill_bin', 'tool_form_more_open', 'tool_form_saved_applied',
  'tool_watch_click',
  'login_open', 'login_email_press', 'login_captcha_missing', 'login_link_sent',
  'login_send_error', 'login_google', 'login_facebook', 'login_passkey',
] as const
export type ToolEventName = (typeof TOOL_EVENT_NAMES)[number]

export const TOOL_EVENT_TOOLS = ['kp', 'schet', 'avr', 'nakladnaya', 'kontragent', 'nalogi', 'margin', 'waybills', 'zarplata'] as const
export type ToolEventTool = (typeof TOOL_EVENT_TOOLS)[number]
// 'none' — только у регистрации без недавнего касания инструмента.
export type ToolEventToolOrNone = ToolEventTool | 'none'

// Откуда клик/документ: cta — общая карточка «Попробовать»/«Открыть кабинет»,
// limit — кнопка в блоке лимита, fullcard — «полная карточка» контрагента,
// product — ссылки на лендинг/кабинет Kaspi Bot, upgrade — «Подключить
// Kaspi Bot» в лимите склейки, export — выгрузка Excel в марже.
export const TOOL_EVENT_MEDIUMS = ['cta', 'limit', 'fullcard', 'product', 'upgrade', 'export'] as const
export type ToolEventMedium = (typeof TOOL_EVENT_MEDIUMS)[number]

export const TOOL_EVENT_LANGS = ['ru', 'kk', 'en'] as const
export type ToolEventLang = (typeof TOOL_EVENT_LANGS)[number]

export type ToolEventDevice = 'mobile' | 'desktop'

export interface ToolEventUtm {
  source?: string
  medium?: string
  campaign?: string
  // 29.10.2026: непрозрачный токен диалога из ссылки напоминания Instagram-агента
  // (src/lib/aiAgent/dmReminder.ts). Случайная строка, личных данных не несёт.
  content?: string
}

// Токен utm_content: только URL-безопасные символы, 8..64. Всё остальное сервер
// и клиент отбрасывают (произвольный utm_content в аналитику не берём).
export const UTM_CONTENT_RE = /^[A-Za-z0-9_-]{8,64}$/

// Тело POST /api/tools/event.
export interface ToolEventPayload {
  event: ToolEventName
  tool: ToolEventToolOrNone
  lang?: ToolEventLang
  visitor?: string
  medium?: ToolEventMedium
  utm?: ToolEventUtm
  referrerHost?: string
  device?: ToolEventDevice
  internal?: boolean
}

export const VISITOR_ID_RE = /^[a-zA-Z0-9-]{8,64}$/

// Первое касание живёт 30 дней: регистрация позже этого срока ни одному
// инструменту не засчитывается.
export const FIRST_TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const isToolEventName = (v: unknown): v is ToolEventName =>
  typeof v === 'string' && (TOOL_EVENT_NAMES as readonly string[]).includes(v)
export const isToolEventTool = (v: unknown): v is ToolEventTool =>
  typeof v === 'string' && (TOOL_EVENT_TOOLS as readonly string[]).includes(v)
