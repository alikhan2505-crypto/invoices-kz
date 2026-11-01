// Ссылки на Telegram-бота «Проверка БИН» и метки мест, откуда приходят люди (30.10.2026).
// Метка едет в параметре start (t.me/<бот>?start=<метка>): Telegram присылает её боту в /start,
// бот записывает в tool_events (utm_source tg_bot, utm_medium start, utm_campaign = метка).
// Только метки из белого списка: произвольный текст в аналитику не попадает.

export const BOT_USERNAME = 'invoices_bin_bot'

export const BOT_START_SOURCES = [
  'site_kontragent', // страница проверки на сайте
  'site_tools', // список инструментов
  'ig_bio', // шапка профиля Instagram
  'ig_story', // Stories
  'ig_dm', // ответ в директе
  'ig_post', // подпись поста
  'chat', // ответы и посты в чатах
  'guide', // гайды
] as const
export type BotStartSource = (typeof BOT_START_SOURCES)[number]

export function botStartLink(source: BotStartSource): string {
  return `https://t.me/${BOT_USERNAME}?start=${source}`
}

/** Метка из текста /start («/start ig_bio») или null, если её нет или она не из белого списка. */
export function parseStartSource(text: unknown): BotStartSource | null {
  if (typeof text !== 'string') return null
  const m = text.trim().match(/^\/start(?:@\w+)?\s+([a-z_]{1,32})$/i)
  if (!m) return null
  const v = m[1].toLowerCase()
  return (BOT_START_SOURCES as readonly string[]).includes(v) ? (v as BotStartSource) : null
}
