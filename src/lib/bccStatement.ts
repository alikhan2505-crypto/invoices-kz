import { StatementRow } from './acquiringMatch'

// BCC's live example response returns partyIdn as a JSON number
// (e.g. 100100100100), not a string — String() it before stripping
// non-digit characters so normalization behaves the same either way.
export interface BccTransaction {
  valueDate: string
  amount: number
  partyIdn: string | number
  purpose?: string
}

export function mapBccTransactions(transactions: BccTransaction[]): StatementRow[] {
  return transactions
    .filter(t => String(t.partyIdn ?? '').trim() !== '')
    .map(t => ({
      date: t.valueDate,
      amount: Number(t.amount),
      bin: String(t.partyIdn).replace(/\D/g, ''),
      description: t.purpose || '',
    }))
}
