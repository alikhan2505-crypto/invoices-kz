export interface StatementRow {
  date: string
  amount: number
  bin: string
  description: string
}

export interface OpenInvoice {
  id: string
  number: string
  client_name: string | null
  client_bin: string | null
  amount: number
}

export interface AcquiringMatch {
  invoice: OpenInvoice
  row: StatementRow
}

export function normalizeBin(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function findMatches(rows: StatementRow[], invoices: OpenInvoice[]): AcquiringMatch[] {
  const matches: AcquiringMatch[] = []
  for (const row of rows) {
    for (const invoice of invoices) {
      if (!invoice.client_bin) continue
      if (normalizeBin(invoice.client_bin) !== normalizeBin(row.bin)) continue
      if (Number(invoice.amount) !== Number(row.amount)) continue
      matches.push({ invoice, row })
    }
  }
  return matches
}
