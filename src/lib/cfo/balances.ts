import type { CfoAccount, CfoOperation } from './types'

export function accountDelta(op: CfoOperation, accountId: string): number {
  if (op.direction === 'in') return op.accountId === accountId ? op.amount : 0
  if (op.direction === 'out') return op.accountId === accountId ? -op.amount : 0
  let d = 0
  if (op.accountId === accountId) d -= op.amount
  if (op.toAccountId === accountId) d += op.amount
  return d
}

// Влияние на сумму всех своих счетов: перевод только перекладывает деньги.
export function totalDelta(op: CfoOperation): number {
  if (op.direction === 'in') return op.amount
  if (op.direction === 'out') return -op.amount
  return 0
}

// ── Кредиты и ипотека ──────────────────────────────────────────────────────
// Счёт вида «кредит» — это долг: его остаток отрицательный и к деньгам не
// относится. Перевод с карты на кредитный счёт — это платёж по кредиту: деньги
// уходят, долг уменьшается.
export const isLoan = (a: Pick<CfoAccount, 'kind'>) => a.kind === 'loan'
export const cashAccounts = <T extends Pick<CfoAccount, 'kind'>>(accounts: T[]): T[] => accounts.filter((a) => !isLoan(a))
export const loanAccounts = <T extends Pick<CfoAccount, 'kind'>>(accounts: T[]): T[] => accounts.filter(isLoan)
export const loanIds = (accounts: Pick<CfoAccount, 'id' | 'kind'>[]): Set<string> => new Set(loanAccounts(accounts).map((a) => a.id))

// Влияние операции на деньги (все счета, кроме кредитных).
export function cashDelta(op: CfoOperation, loans: Set<string>): number {
  if (op.direction === 'in') return loans.has(op.accountId) ? 0 : op.amount
  if (op.direction === 'out') return loans.has(op.accountId) ? 0 : -op.amount
  let d = 0
  if (!loans.has(op.accountId)) d -= op.amount
  if (op.toAccountId && !loans.has(op.toAccountId)) d += op.amount
  return d
}

// Платёж деньгами наружу / поступление денег — по тому, как операция меняет деньги:
// расход с карты и платёж по кредиту (перевод на кредитный счёт) — выплата; приход
// на карту и полученный кредит (перевод с кредитного счёта) — поступление. Перевод
// между своими денежными счетами и начисления прямо на кредитном счёте — ни то, ни другое.
export const isCashOut = (op: CfoOperation, loans: Set<string>): boolean => cashDelta(op, loans) < 0
export const isCashIn = (op: CfoOperation, loans: Set<string>): boolean => cashDelta(op, loans) > 0

// Остаток счёта на конец дня `date` по фактическим операциям.
export function accountBalanceAt(account: CfoAccount, operations: CfoOperation[], date: string): number {
  if (date < account.openingDate) return 0
  let sum = account.openingBalance
  for (const op of operations) {
    if (op.status !== 'actual' || op.paidOn > date || op.paidOn < account.openingDate) continue
    sum += accountDelta(op, account.id)
  }
  return sum
}

// По всем счетам, включая архивные: архив только прячет счёт из выбора, его деньги
// реальны, а без них не сходилось бы «остаток на начало + поток = остаток на конец».
export function totalBalanceAt(accounts: CfoAccount[], operations: CfoOperation[], date: string): number {
  return accounts.reduce((s, a) => s + accountBalanceAt(a, operations, date), 0)
}

// Деньги на конец дня — без кредитных счетов.
export function cashBalanceAt(accounts: CfoAccount[], operations: CfoOperation[], date: string): number {
  return totalBalanceAt(cashAccounts(accounts), operations, date)
}

// Долги на конец дня: сумма остатков кредитных счетов (обычно отрицательная).
export function debtAt(accounts: CfoAccount[], operations: CfoOperation[], date: string): number {
  return totalBalanceAt(loanAccounts(accounts), operations, date)
}
