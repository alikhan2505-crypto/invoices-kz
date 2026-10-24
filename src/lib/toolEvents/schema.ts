// Своя минимальная аналитика бесплатных инструментов (15.10.2026): Vercel Web
// Analytics у проекта не включён, и все track() из @vercel/analytics ничего
// не записывают. События пишутся в public.tool_events (миграция
// supabase/migrations/tool_events.sql) через POST /api/tools/event, а
// читаются на /admin → вкладка «Инструменты».
//
// Этот файл — общий словарь клиента и сервера, без зависимостей от браузера
// или Supabase. Списки совпадают с CHECK-ограничениями таблицы: новое событие
// или инструмент надо добавить и здесь, и в миграции.

export const TOOL_EVENT_NAMES = ['view', 'doc', 'cta', 'limit', 'lead', 'signup'] as const
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
}

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
