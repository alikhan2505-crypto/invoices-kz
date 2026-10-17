// Утренняя сводка CFO для Telegram. Чистая функция над рабочим пространством:
// те же расчёты, что календарь и обзор, поэтому цифры в сообщении и в кабинете
// совпадают. Текст — Telegram HTML, всё пользовательское экранируется.
// Слова — по режиму кабинета: в семейном бюджете нет «кассового разрыва» и «клиентов».
import type { Workspace } from './data'
import { CALENDAR_HORIZON_DAYS, buildCalendar } from './calendar'
import { cashBalanceAt, debtAt, isCashIn, isCashOut, loanIds } from './balances'
import { addDays, firstDay, monthKey } from './dates'
import { dayLabel, opTitle, plural } from './labels'
import { formatTenge } from './money'
import type { CfoOperation } from './types'
import { forecastOperations, overdueReceivables } from './invoiceLink'
import { monthLimits } from './limits'
import { displayName } from './mode'

export const DIGEST_URL = 'https://cfo.invoices.kz/cfo/calendar'
const LIST_LIMIT = 5

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const sum = (ops: { amount: number }[]) => ops.reduce((s, o) => s + o.amount, 0)

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

const payments = (n: number) => `${n} ${plural(n, 'платёж', 'платежа', 'платежей')}`

export function buildDigest(ws: Workspace, today: string): string {
  const family = ws.mode === 'family'
  const actual = ws.operations.filter((o) => o.status === 'actual')
  const cash = cashBalanceAt(ws.accounts, actual, today)
  const cal = buildCalendar({
    accounts: ws.accounts,
    operations: forecastOperations(ws, today),
    recurrences: ws.recurrences,
    today,
    from: firstDay(monthKey(today)),
    to: addDays(today, CALENDAR_HORIZON_DAYS - 1),
  })
  const upcoming = (from: string, to: string) =>
    cal.days.filter((d) => d.date >= from && d.date <= to).flatMap((d) => d.items.filter((o) => o.status === 'planned'))
  // Платёж/поступление — по деньгам, как остаток в календаре: плановый платёж по
  // ипотеке (перевод на кредитный счёт) — тоже «к оплате», иначе сводка говорила бы
  // «платежей нет» рядом с «денег не хватит».
  const loans = loanIds(ws.accounts)
  const todayItems = upcoming(today, today)
  const toPay = todayItems.filter((o) => isCashOut(o, loans))
  const toReceive = todayItems.filter((o) => isCashIn(o, loans))
  const week = upcoming(addDays(today, 1), addDays(today, 7))
  const title = (o: CfoOperation) => esc(o.counterparty?.trim() || opTitle(o, ws.accounts, ws.articles))

  const lines: string[] = [`<b>${family ? 'Семейный бюджет' : 'CFO'} · ${esc(displayName(ws))}</b> — ${dayLabel(today)}`, '']
  lines.push(`💰 ${family ? 'Денег' : 'На счетах'}: <b>${formatTenge(cash)}</b>`)
  if (loans.size > 0) lines.push(`🏦 Долги: ${formatTenge(debtAt(ws.accounts, actual, today))}`)

  if (toPay.length > 0) {
    lines.push(`📤 Сегодня к оплате: ${payments(toPay.length)} на <b>${formatTenge(sum(toPay))}</b>`)
    for (const o of toPay.slice(0, LIST_LIMIT)) lines.push(`   • ${title(o)} — ${formatTenge(o.amount)}`)
    if (toPay.length > LIST_LIMIT) lines.push(`   • и ещё ${toPay.length - LIST_LIMIT}`)
  } else {
    lines.push('📤 Сегодня платежей нет')
  }
  if (toReceive.length > 0) lines.push(`📥 Сегодня ожидается: ${formatTenge(sum(toReceive))}`)

  const overdueOut = cal.overdue.filter((o) => isCashOut(o, loans))
  if (overdueOut.length > 0) lines.push(`⚠️ Просрочено: ${payments(overdueOut.length)} на ${formatTenge(sum(overdueOut))}`)
  const unpaid = overdueReceivables(ws, today)
  if (unpaid.length > 0) lines.push(`💸 ${family ? 'Не оплачены вовремя выставленные счета' : 'Клиенты не оплатили в срок'}: ${unpaid.length} ${plural(unpaid.length, 'счёт', 'счёта', 'счетов')} на ${formatTenge(sum(unpaid))}`)

  if (cal.firstGap) {
    const gapDay = cal.days.find((d) => d.date === cal.firstGap)!
    const inDays = daysBetween(today, cal.firstGap)
    const when = inDays === 0 ? 'сегодня' : `${dayLabel(cal.firstGap)} — через ${inDays} ${plural(inDays, 'день', 'дня', 'дней')}`
    lines.push(family
      ? `🔴 Денег не хватит ${when}: по запланированным платежам не достаёт ${formatTenge(-gapDay.balance)}`
      : `🔴 Кассовый разрыв ${when}: не хватит ${formatTenge(-gapDay.balance)}`)
  } else {
    lines.push(family
      ? `✅ Денег на все платежи ближайших ${CALENDAR_HORIZON_DAYS} дней хватает`
      : `✅ Кассовых разрывов в ближайшие ${CALENDAR_HORIZON_DAYS} дней нет`)
  }

  const tight = monthLimits(ws, monthKey(today)).filter((r) => r.level !== 'ok').slice(0, 3)
  if (tight.length > 0) lines.push(`📊 ${family ? 'Бюджет месяца' : 'Лимиты месяца'}: ${tight.map((r) => `${esc(r.name)} ${Math.round(r.share * 100)}%`).join(', ')}`)

  const weekOut = sum(week.filter((o) => isCashOut(o, loans)))
  const weekIn = sum(week.filter((o) => isCashIn(o, loans)))
  if (weekOut > 0 || weekIn > 0) lines.push(`📆 Следующие 7 дней: ${family ? 'платежи' : 'выплаты'} ${formatTenge(weekOut)}, поступления ${formatTenge(weekIn)}`)

  lines.push('', `<a href="${DIGEST_URL}">${family ? 'Открыть платежи' : 'Открыть платёжный календарь'}</a>`)
  return lines.join('\n')
}

// Дата «сегодня» по Алматы (UTC+5 без перехода на летнее время) — сервер живёт в UTC.
export function almatyToday(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 5 * 3600 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
