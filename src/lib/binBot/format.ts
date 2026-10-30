import { escapeHtml } from '@/lib/htmlEscape'
import { isValidBin, normalizeBin, type BinLookupResult } from '@/lib/binLookup'
import { unreliableCategoriesText } from '@/lib/binRiskText'

// Telegram-бот «Проверка БИН» (30.10.2026): человек присылает 12 цифр и получает короткий
// результат из открытых реестров КГД и Минюста, как на /tools/kontragent. Здесь только чистая
// часть без сети: разбор сообщения и текст ответа (HTML для parse_mode=HTML). Маршрут:
// src/app/api/telegram/bin-bot/route.ts. В тексте нет тире и эмодзи (правило проекта).

export const BOT_SITE = 'https://invoices.kz'
/** Короткая ссылка с меткой tg_bot (goLinks.ts): полная проверка и регистрация. */
export const BOT_TOOL_LINK = `${BOT_SITE}/go/bot-kontragent`
export const BOT_FREE_PER_QUARTER = 3

export type BotInput =
  | { kind: 'start' }
  | { kind: 'help' }
  | { kind: 'bin'; bin: string }
  | { kind: 'other' }

/** Что прислал человек: команда, БИН (в любом написании с пробелами) или что-то другое. */
export function parseBotInput(text: unknown): BotInput {
  if (typeof text !== 'string') return { kind: 'other' }
  const t = text.trim()
  if (/^\/start(@\w+)?(\s|$)/i.test(t)) return { kind: 'start' }
  if (/^\/help(@\w+)?(\s|$)/i.test(t)) return { kind: 'help' }
  const bin = normalizeBin(t)
  if (isValidBin(bin) && /^[\d\s-]{12,20}$/.test(t)) return { kind: 'bin', bin }
  // БИН внутри фразы: «проверь 123456789012 пожалуйста».
  const inside = t.match(/(?<!\d)(\d{12})(?!\d)/)
  if (inside && isValidBin(inside[1])) return { kind: 'bin', bin: inside[1] }
  return { kind: 'other' }
}

export const START_TEXT =
  'Проверка контрагента по БИН. Пришлите 12 цифр БИН или ИИН, и я проверю компанию по открытым реестрам: ' +
  'неблагонадёжные налогоплательщики, ликвидация, налоговая задолженность, НДС, исполнительные производства, ' +
  `реестр недобросовестных поставщиков госзакупок.\n\n${BOT_FREE_PER_QUARTER} проверки в квартал бесплатно.`

export const HELP_TEXT = 'Пришлите 12 цифр БИН (например, 123456789012), я отвечу результатом проверки.'
export const NOT_A_BIN_TEXT = 'Не вижу БИН. Пришлите 12 цифр одним сообщением.'
export const BUSY_TEXT = 'Реестры сейчас перегружены. Попробуйте через несколько минут.'
export const UNAVAILABLE_TEXT = 'Реестры сейчас не отвечают, проверка не списана. Попробуйте позже.'
export const NOT_FOUND_TEXT = 'По этому БИН ничего не найдено в открытых реестрах. Проверьте цифры.'

export function limitText(): string {
  return `Бесплатные проверки на этот квартал закончились (${BOT_FREE_PER_QUARTER}). ` +
    `Без ограничений с регистрацией: ${BOT_TOOL_LINK}`
}

function money(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₸`
}

function yesNoUnknown(v: boolean | null | undefined, yes: string, no: string): string {
  if (v === true) return yes
  if (v === false) return no
  return 'не удалось проверить'
}

/** Ответ на найденный БИН. HTML: каждое значение из реестров экранируется. */
export function formatCheckReply(c: BinLookupResult, remaining: number): string {
  const lines: string[] = []
  lines.push(`<b>${escapeHtml(c.name)}</b>`)
  lines.push(`БИН ${escapeHtml(c.bin)}`)
  if (c.status) lines.push(`Статус: ${escapeHtml(c.status)}${c.registeredAt ? `, с ${escapeHtml(c.registeredAt)}` : ''}`)
  lines.push('')
  const cats = unreliableCategoriesText(c.unreliableCategories, 'ru')
  lines.push(`Неблагонадёжный налогоплательщик (КГД): ${yesNoUnknown(c.isUnreliable, 'ДА' + (cats ? `, ${escapeHtml(cats)}` : ''), 'нет')}`)
  lines.push(`Ликвидация: ${yesNoUnknown(c.isLiquidating, 'ДА', 'нет')}`)
  if (c.totalArrear === null && c.taxArrear === null) {
    lines.push('Налоговая задолженность: не удалось проверить')
  } else {
    const arrear = Math.max(c.totalArrear ?? 0, c.taxArrear ?? 0)
    lines.push(`Налоговая задолженность: ${arrear > 0 ? money(arrear) : 'нет'}`)
  }
  lines.push(`Плательщик НДС: ${yesNoUnknown(c.isVatPayer, 'да', 'нет')}`)
  if (c.enforcement !== undefined) {
    const e = c.enforcement
    lines.push(e === null ? 'Исполнительные производства (Минюст): не удалось проверить'
      : e.found ? `Исполнительные производства (Минюст): ${e.activeCount > 0 ? `активных ${e.activeCount}` : `записей ${e.count}`}`
      : 'Исполнительные производства (Минюст): нет')
  }
  if (c.rnu !== undefined) {
    lines.push(c.rnu === null ? 'Реестр недобросовестных поставщиков госзакупок: не удалось проверить'
      : c.rnu.found ? `Реестр недобросовестных поставщиков госзакупок: ДА (записей ${c.rnu.count})`
      : 'Реестр недобросовестных поставщиков госзакупок: нет')
  }
  lines.push('')
  lines.push('Данные открытых реестров КГД и Минюста, носят справочный характер.')
  lines.push(`Осталось бесплатных проверок: ${remaining}.`)
  return lines.join('\n')
}
