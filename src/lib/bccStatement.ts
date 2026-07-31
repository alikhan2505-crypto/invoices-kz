import { StatementRow } from './acquiringMatch'

// BCC's live example response returns partyIdn as a JSON number
// (e.g. 100100100100), not a string — String() it before stripping
// non-digit characters so normalization behaves the same either way.
export interface BccTransaction {
  valueDate: string
  amount: number
  partyIdn: string | number
  purpose?: string
  dbcrfl: number
}

export function mapBccTransactions(transactions: BccTransaction[]): StatementRow[] {
  return transactions
    // ⚠️ UNVERIFIED ASSUMPTION — VERIFY AGAINST A REAL BCC STATEMENT BEFORE
    // PRODUCTION USE. A BCC business-account statement contains BOTH incoming
    // and outgoing transactions (unlike the Kaspi Pay Excel export, which is
    // incoming-only), so money the user SENDS to a counterparty whose BIN and
    // amount happen to match an open invoice would otherwise surface as a
    // "payment received" candidate. `dbcrfl` is BCC's debit/credit flag; the
    // ONE real example in BCC's docs shows dbcrfl: 1 on a transaction
    // described as "Для зачисления на картсчета сотрудникам" (an incoming /
    // credit movement), so 1 is treated here as credit/incoming. That is a
    // single data point, not a confirmed spec. If it turns out to be inverted,
    // or to use different values entirely, THIS LINE is the one to fix.
    .filter(t => t.dbcrfl === 1)
    .filter(t => String(t.partyIdn ?? '').trim() !== '')
    .map(t => ({
      date: t.valueDate,
      amount: Number(t.amount),
      bin: String(t.partyIdn).replace(/\D/g, ''),
      description: t.purpose || '',
    }))
}
