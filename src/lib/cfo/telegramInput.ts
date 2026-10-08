// Ввод операций сообщением в бот уведомлений: «аренда 300к», «пришло 450 000 от
// Ромашки вчера». Модель только разбирает текст в JSON; всё, что она вернула,
// проверяется здесь по справочникам владельца — чужой id или неверный вид
// статьи не пройдут.
import type { Workspace } from './data'
import { addDays, isIsoDate } from './dates'
import { formatTenge, MAX_AMOUNT_TIYN } from './money'
import { dayLabel } from './labels'
import type { OperationDraft } from './validate'

export const TELEGRAM_MARK = 'Telegram: '
export const UNDO_WORDS = ['/undo', 'отмена', 'отменить', 'удали', 'удалить']

export type Parsed = { direction?: unknown; amount?: unknown; article_id?: unknown; account_id?: unknown; counterparty?: unknown; date?: unknown }

export function parsePrompt(ws: Workspace, today: string, text: string): string {
  const articles = ws.articles.filter((a) => !a.archived).map((a) => `${a.id} | ${a.kind === 'income' ? 'доход' : 'расход'} | ${a.name}`).join('\n')
  const accounts = ws.accounts.filter((a) => !a.archived).map((a) => `${a.id} | ${a.name}`).join('\n')
  return `Разбери сообщение владельца бизнеса об операции с деньгами. Сегодня ${today} (Казахстан).
Статьи (id | вид | название):
${articles}
Счета (id | название):
${accounts}

Ответь ТОЛЬКО JSON без пояснений:
{"direction":"in"|"out","amount":<число в тенге>,"article_id":"<id из списка>","account_id":"<id из списка или null>","counterparty":"<кто платил/кому, или null>","date":"YYYY-MM-DD"}
Правила: «к» = тысячи, «млн» = миллионы; «пришло/получили/оплатил клиент» = in; «заплатили/купили/оплатили» без клиента = out; статья должна быть того же вида, что направление (in → доход, out → расход); если подходящей нет — «Прочие …» нужного вида; «вчера» = ${addDays(today, -1)}; без даты — сегодня. Если это не операция с деньгами — ответь {"error":"not_operation"}.

Сообщение: ${text}`
}

export type Checked = { ok: true; draft: OperationDraft & { counterparty: string | null; comment: string } } | { ok: false; error: string }

export function checkParsed(p: Parsed, ws: Workspace, today: string, text: string): Checked {
  const direction = p.direction === 'in' || p.direction === 'out' ? p.direction : null
  if (!direction) return { ok: false, error: 'Не понял, приход это или расход. Напишите, например: «аренда 300 000» или «пришло 450 000 от ТОО Ромашка».' }
  const amount = typeof p.amount === 'number' ? Math.round(p.amount * 100) : NaN
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_TIYN) return { ok: false, error: 'Не понял сумму. Напишите её цифрами, например 300 000 или 300к.' }
  const article = ws.articles.find((a) => a.id === p.article_id && !a.archived && a.kind === (direction === 'in' ? 'income' : 'expense'))
  if (!article) return { ok: false, error: 'Не смог подобрать статью — уточните, на что деньги (например «аренда», «зарплата», «закупка»).' }
  const live = ws.accounts.filter((a) => !a.archived)
  const account = live.find((a) => a.id === p.account_id) ?? live.find((a) => a.kind === 'bank') ?? live[0]
  if (!account) return { ok: false, error: 'В кабинете нет ни одного счёта — добавьте его в настройках CFO.' }
  const date = typeof p.date === 'string' && isIsoDate(p.date) && p.date >= addDays(today, -366) && p.date <= addDays(today, 366) ? p.date : today
  const counterparty = typeof p.counterparty === 'string' && p.counterparty.trim() ? p.counterparty.trim().slice(0, 200) : null
  return {
    ok: true,
    draft: {
      direction, amount, accountId: account.id, toAccountId: null, articleId: article.id, paidOn: date, accruedOn: date,
      status: date > today ? 'planned' : 'actual', counterparty, comment: `${TELEGRAM_MARK}${text.slice(0, 400)}`,
    },
  }
}

export function confirmation(ws: Workspace, d: OperationDraft & { counterparty: string | null }, today: string): string {
  const article = ws.articles.find((a) => a.id === d.articleId)?.name ?? ''
  const account = ws.accounts.find((a) => a.id === d.accountId)?.name ?? ''
  const when = d.paidOn === today ? 'сегодня' : dayLabel(d.paidOn)
  const kind = d.status === 'planned' ? 'План' : d.direction === 'in' ? 'Приход' : 'Расход'
  return `✅ ${kind} ${d.direction === 'in' ? '+' : '−'}${formatTenge(d.amount)} · ${article} · ${account} · ${when}${d.counterparty ? ` · ${d.counterparty}` : ''}\nОшиблись — напишите «отмена».`
}

export function extractJson(raw: string): Parsed | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as Parsed
  } catch {
    return null
  }
}
