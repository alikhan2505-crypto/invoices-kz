import { KaspiHistoryOperation } from './client'

export interface OpenInvoiceForMatch {
  id: string
  number: string
  client_name: string | null
  amount: number
}

export type MatchResult =
  | { kind: 'unmatched' }
  | { kind: 'unambiguous', invoice: OpenInvoiceForMatch }
  | { kind: 'ambiguous', invoices: OpenInvoiceForMatch[] }

// Mirrors acquiringMatch.ts's findMatches (the established BCC/Excel-import
// amount-matching pattern) rather than a new approach: match by amount,
// nothing more. Outgoing operations never match -- a payment collected
// FROM invoices.kz's connection owner is never itself an invoice being
// paid.
export function matchOperation(operation: KaspiHistoryOperation, openInvoices: OpenInvoiceForMatch[]): MatchResult {
  if (operation.direction !== 'in') return { kind: 'unmatched' }
  const candidates = openInvoices.filter(inv => Number(inv.amount) === Number(operation.amount))
  if (candidates.length === 0) return { kind: 'unmatched' }
  if (candidates.length === 1) return { kind: 'unambiguous', invoice: candidates[0] }
  return { kind: 'ambiguous', invoices: candidates }
}
