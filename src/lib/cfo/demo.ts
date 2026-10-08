// «Посмотреть на примере»: правдоподобная небольшая торговая компания за
// последние 5 месяцев + план и платежи вперёд, с кассовым разрывом и
// превышенным лимитом — чтобы все экраны кабинета сразу показали, зачем они.
// Чистая функция: id генерирует вызывающий (newId), даты — от today.
import type { CfoArticle } from './types'
import { addDays, addMonths, daysInMonth, firstDay, monthKey } from './dates'

export type DemoAccount = { id: string; name: string; kind: 'bank' | 'cash'; openingBalance: number; openingDate: string }
export type DemoOp = { direction: 'in' | 'out'; amount: number; accountId: string; articleId: string; counterparty: string; paidOn: string; status: 'actual' | 'planned' }
export type DemoRecurrence = { direction: 'out'; amount: number; accountId: string; articleId: string; counterparty: string; dayOfMonth: number; startsOn: string }
export type DemoPlan = { articleId: string; month: string; amount: number }
export type Demo = { accounts: DemoAccount[]; operations: DemoOp[]; recurrences: DemoRecurrence[]; plan: DemoPlan[] }

const K = 100_000 // 1 000 ₸ в тиынах
const CLIENTS = ['ТОО «Альфа Трейд»', 'ИП Сериков', 'ТОО «Береке Маркет»', 'Kaspi Pay']

export function buildDemo(today: string, articles: CfoArticle[], newId: () => string): Demo | null {
  const find = (prefix: string) => articles.find((a) => !a.archived && a.name.toLowerCase().startsWith(prefix))?.id
  const a = {
    sales: find('выручка от продажи'), buy: find('закупка'), salary: find('зарплата'), payroll: find('налоги и взносы с зарплаты'),
    rent: find('аренда'), util: find('коммунальн'), ads: find('реклама'), net: find('связь'), fees: find('банковские комиссии'),
  }
  if (Object.values(a).some((v) => !v)) return null // стартовые статьи переименованы или в архиве — пример не соберётся
  const id = a as Record<keyof typeof a, string>

  const start = addMonths(monthKey(today), -5)
  const bank: DemoAccount = { id: newId(), name: 'Kaspi Business (пример)', kind: 'bank', openingBalance: 2_500 * K, openingDate: firstDay(start) }
  const cash: DemoAccount = { id: newId(), name: 'Касса (пример)', kind: 'cash', openingBalance: 100 * K, openingDate: firstDay(start) }
  const ops: DemoOp[] = []
  const push = (o: Omit<DemoOp, 'status'>) => {
    if (o.paidOn >= bank.openingDate && o.paidOn <= today) ops.push({ ...o, status: 'actual' })
  }

  for (let i = 0; i < 6; i++) {
    const m = addMonths(start, i)
    const day = (d: number) => `${m}-${String(Math.min(d, daysInMonth(m))).padStart(2, '0')}`
    let revenue = 0
    ;[3, 10, 17, 24].forEach((d, w) => {
      const amount = (950 + ((i * 4 + w) * 137) % 350) * K
      revenue += amount
      push({ direction: 'in', amount, accountId: bank.id, articleId: id.sales, counterparty: CLIENTS[(i + w) % CLIENTS.length], paidOn: day(d) })
    })
    push({ direction: 'out', amount: Math.round((revenue * 0.25) / K) * K, accountId: bank.id, articleId: id.buy, counterparty: 'ТОО «Оптовик»', paidOn: day(6) })
    push({ direction: 'out', amount: Math.round((revenue * 0.25) / K) * K, accountId: bank.id, articleId: id.buy, counterparty: 'ТОО «Оптовик»', paidOn: day(20) })
    push({ direction: 'out', amount: 450 * K, accountId: bank.id, articleId: id.rent, counterparty: 'ИП Жумабаев', paidOn: day(5) })
    push({ direction: 'out', amount: 900 * K, accountId: bank.id, articleId: id.salary, counterparty: 'Сотрудники', paidOn: day(10) })
    push({ direction: 'out', amount: 150 * K, accountId: bank.id, articleId: id.ads, counterparty: 'Instagram / 2ГИС', paidOn: day(2) })
    push({ direction: 'out', amount: 60 * K, accountId: cash.id, articleId: id.util, counterparty: 'Алматы Энергосбыт', paidOn: day(15) })
    push({ direction: 'out', amount: 25 * K, accountId: bank.id, articleId: id.net, counterparty: 'Казахтелеком', paidOn: day(8) })
    push({ direction: 'out', amount: 205 * K, accountId: bank.id, articleId: id.payroll, counterparty: 'Бюджет РК', paidOn: day(25) })
    push({ direction: 'out', amount: 12 * K, accountId: bank.id, articleId: id.fees, counterparty: 'Kaspi Bank', paidOn: day(28) })
  }

  // Вперёд: ожидаемые оплаты, регулярные платежи и крупная закупка к сезону, которая и делает разрыв.
  const planned = (o: Omit<DemoOp, 'status'>) => ops.push({ ...o, status: 'planned' })
  planned({ direction: 'in', amount: 1_200 * K, accountId: bank.id, articleId: id.sales, counterparty: 'ТОО «Альфа Трейд»', paidOn: addDays(today, 6) })
  planned({ direction: 'in', amount: 900 * K, accountId: bank.id, articleId: id.sales, counterparty: 'ТОО «Береке Маркет»', paidOn: addDays(today, 16) })
  planned({ direction: 'out', amount: 6_500 * K, accountId: bank.id, articleId: id.buy, counterparty: 'ТОО «Оптовик» — партия к сезону', paidOn: addDays(today, 24) })

  const startsOn = addDays(today, 1) // повторы только вперёд, чтобы не появлялась «просрочка» в прошлом
  const recurrences: DemoRecurrence[] = [
    { direction: 'out', amount: 450 * K, accountId: bank.id, articleId: id.rent, counterparty: 'ИП Жумабаев', dayOfMonth: 5, startsOn },
    { direction: 'out', amount: 900 * K, accountId: bank.id, articleId: id.salary, counterparty: 'Сотрудники', dayOfMonth: 10, startsOn },
    { direction: 'out', amount: 205 * K, accountId: bank.id, articleId: id.payroll, counterparty: 'Бюджет РК', dayOfMonth: 25, startsOn },
  ]

  const plan: DemoPlan[] = []
  for (let i = 0; i < 3; i++) {
    const m = addMonths(monthKey(today), i)
    plan.push(
      { articleId: id.sales, month: m, amount: 4_600 * K },
      { articleId: id.buy, month: m, amount: 2_300 * K },
      { articleId: id.salary, month: m, amount: 900 * K },
      { articleId: id.rent, month: m, amount: 450 * K },
      { articleId: id.ads, month: m, amount: 120 * K }, // факт 150 000 — лимит превышен, видно на «Обзоре»
    )
  }
  return { accounts: [bank, cash], operations: ops, recurrences, plan }
}
