import { PRODUCTS } from '@/lib/products'

// Where a SIGNED-IN visitor of a free tool goes from the tool's «Открыть
// кабинет» buttons (bottom ToolCta card, limit blocks, kontragent's
// «полная карточка»). Founder, 15.10.2026: an admin who was already signed in
// pressed «Попробовать бесплатно» and was walked through /login into a dead
// end; a signed-in person should go straight to the matching cabinet page.
// A visitor without a session keeps the /login links exactly as before.
//
//   kp, schet, avr, nakladnaya -> /create (invoice form; on the free plan the
//                                 account issues invoices, КП/АВР/накладные
//                                 are Pro and are made from an invoice)
//   kontragent                 -> /create (the in-app counterparty check IS
//                                 the client БИН field of the invoice form:
//                                 /api/bin-lookup, no per-user or per-plan
//                                 limit; there is no separate page, /verify
//                                 is ЭЦП signature verification)
//   nalogi                     -> /dashboard
//   margin                     -> /kaspi-shop with Kaspi Bot access (Pro or
//                                 admin), otherwise the Kaspi Bot landing
//   anything else              -> /dashboard
//
// utm params ride along like on the anonymous links, so analytics can still
// tell which tool and which block sent the click.

export type ToolCtaMedium = 'cta' | 'limit' | 'fullcard'

export const KASPI_BOT_LANDING_ORIGIN =
  PRODUCTS.find(p => p.key === 'kaspiShop')?.landing ?? 'https://kaspi.invoices.kz'

const CABINET_PATH: Record<string, string> = {
  kp: '/create',
  schet: '/create',
  avr: '/create',
  nakladnaya: '/create',
  kontragent: '/create',
  nalogi: '/dashboard',
}

function utm(source: string, medium: ToolCtaMedium): string {
  return `utm_source=tools&utm_medium=${medium}&utm_campaign=${encodeURIComponent(source)}`
}

export function signedInToolHref(
  source: string,
  medium: ToolCtaMedium,
  opts: { kaspiShopAccess?: boolean } = {},
): string {
  if (source === 'margin') {
    return opts.kaspiShopAccess
      ? `/kaspi-shop?${utm(source, medium)}`
      : `${KASPI_BOT_LANDING_ORIGIN}/?${utm(source, medium)}`
  }
  return `${CABINET_PATH[source] ?? '/dashboard'}?${utm(source, medium)}`
}

/** The anonymous link, unchanged: through /login with the same utm. */
export function anonymousToolHref(source: string, medium: ToolCtaMedium): string {
  return `/login?${utm(source, medium)}`
}
