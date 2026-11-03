// КНП и режим НДС, которые хранятся в самом счёте (invoices.knp, invoices.vat_type).
//
// Раньше КНП из формы нигде не сохранялся (PDF по ссылке клиента всегда был с 849),
// а НДС старых счетов пересчитывался по ТЕКУЩЕМУ режиму профиля: сменил режим —
// и выпущенные счета «менялись задним числом». Теперь значения пишутся в счёт при
// создании. У старых счетов колонки пустые: для них остаётся прежнее поведение
// (КНП 849, НДС по профилю).

export type VatType = 'no_vat' | 'vat_0' | 'vat_16'

export const DEFAULT_KNP = '849'

const VAT_TYPES: ReadonlyArray<string> = ['no_vat', 'vat_0', 'vat_16']

export function isVatType(v: unknown): v is VatType {
  return typeof v === 'string' && VAT_TYPES.includes(v)
}

/** Режим НДС счёта: свой, если записан, иначе режим профиля продавца, иначе без НДС. */
export function resolveInvoiceVatType(
  invoice: { vat_type?: string | null } | null | undefined,
  profile: { vat_type?: string | null } | null | undefined,
): VatType {
  if (isVatType(invoice?.vat_type)) return invoice.vat_type
  if (isVatType(profile?.vat_type)) return profile.vat_type
  return 'no_vat'
}

/** КНП счёта: свой, если это три цифры, иначе 849 (оплата за услуги). */
export function resolveInvoiceKnp(invoice: { knp?: string | null } | null | undefined): string {
  const k = invoice?.knp
  return typeof k === 'string' && /^\d{3}$/.test(k) ? k : DEFAULT_KNP
}
