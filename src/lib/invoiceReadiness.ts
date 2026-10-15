// What the /create form still lacks before «Создать и скачать PDF» can go
// through. One copy of the rules, read by two things that must never disagree:
// the readiness indicator above the button and createInvoice() itself, which
// turns the first problem into the same alert it always showed.
//
// These are the page's rules exactly as they stood on 15.10.2026 -- nothing
// added, nothing relaxed: a client name and a БИН must be there (truthy, as
// before), there must be at least one line, every line needs a name and none
// may have a price of 0. The seller's own requisites and bank account are a
// separate gate that stays in createInvoice(); they are not the form's job.

export type ReadinessProblem = 'clientName' | 'clientBin' | 'itemName' | 'itemPrice'

export interface ReadinessInput {
  clientName: string
  clientBin: string
  services: { name?: string | null; price?: number | null }[]
}

export interface InvoiceReadiness {
  /** Client name and БИН are both filled in. */
  client: boolean
  /** At least one line, every line named, no line priced at 0. */
  items: boolean
  /** Both of the above -- the form itself has nothing left to ask for. */
  ready: boolean
  /** The first thing missing, in the order createInvoice() checks it. */
  firstProblem: ReadinessProblem | null
}

export function computeInvoiceReadiness({ clientName, clientBin, services }: ReadinessInput): InvoiceReadiness {
  const nameOk = !!clientName
  const binOk = !!clientBin
  const itemNamesOk = services.length > 0 && !services.some(s => !s.name)
  const itemPricesOk = !services.some(s => s.price === 0)

  const firstProblem: ReadinessProblem | null =
    !nameOk ? 'clientName'
      : !binOk ? 'clientBin'
        : !itemNamesOk ? 'itemName'
          : !itemPricesOk ? 'itemPrice'
            : null

  const client = nameOk && binOk
  const items = itemNamesOk && itemPricesOk
  return { client, items, ready: client && items, firstProblem }
}
