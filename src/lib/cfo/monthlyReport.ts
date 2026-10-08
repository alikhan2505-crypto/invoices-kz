// Итоги месяца для Telegram 1-го числа: выручка, прибыль и деньги за прошлый
// месяц против плана и позапрошлого месяца. Те же формулы, что «Обзор».
import type { Workspace } from './data'
import { buildPnl } from './pnl'
import { totalBalanceAt } from './balances'
import { addDays, addMonths, firstDay, lastDay } from './dates'
import { monthTitle } from './labels'
import { formatTenge } from './money'
import { monthLimits } from './limits'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function pct(a: number, b: number): string {
  if (!b) return ''
  const p = Math.round(((a - b) / Math.abs(b)) * 100)
  return ` (${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%)`
}

export function buildMonthlyReport(ws: Workspace, month: string): string {
  const prev = addMonths(month, -1)
  const pnl = buildPnl({ articles: ws.articles, operations: ws.operations, plan: ws.plan, months: [prev, month] })
  const row = (key: string) => pnl.find((r) => r.key === key)
  const rev = row('g:revenue'), net = row('t:net')
  const actual = ws.operations.filter((o) => o.status === 'actual')
  const cashStart = totalBalanceAt(ws.accounts, actual, addDays(firstDay(month), -1))
  const cashEnd = totalBalanceAt(ws.accounts, actual, lastDay(month))

  const family = ws.mode === 'family'
  const lines = [`<b>CFO · ${esc(ws.companyName)} — итоги: ${monthTitle(month).toLowerCase()}</b>`, '']
  if (rev) {
    const f = rev.cells[month].fact
    lines.push(`📈 ${family ? 'Доходы' : 'Выручка'}: <b>${formatTenge(f)}</b>${rev.cells[month].plan ? ` · план ${formatTenge(rev.cells[month].plan)}${pct(f, rev.cells[month].plan)}` : ''}${rev.cells[prev].fact ? ` · к прошлому месяцу${pct(f, rev.cells[prev].fact)}` : ''}`)
  }
  if (net) {
    const f = net.cells[month].fact
    lines.push(`${f < 0 ? '🔻' : '💼'} ${family ? 'Сбережено' : 'Чистая прибыль'}: <b>${formatTenge(f)}</b>${net.cells[month].plan ? ` · план ${formatTenge(net.cells[month].plan)}` : ''}`)
  }
  lines.push(`💰 Деньги: ${formatTenge(cashStart)} → <b>${formatTenge(cashEnd)}</b> (${cashEnd >= cashStart ? '+' : '−'}${formatTenge(Math.abs(cashEnd - cashStart))})`)

  const over = monthLimits(ws, month).filter((r) => r.level === 'over')
  if (over.length > 0) lines.push(`📊 Перерасход: ${over.slice(0, 3).map((r) => `${esc(r.name)} +${formatTenge(r.fact - r.plan)}`).join(', ')}`)

  lines.push('', 'Подробный разбор — «Спросите CFO» на обзоре: «Разбери прошлый месяц».', `<a href="https://cfo.invoices.kz/cfo/pnl">Открыть ${family ? 'доходы и расходы' : 'БДР'}</a>`)
  return lines.join('\n')
}
