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
