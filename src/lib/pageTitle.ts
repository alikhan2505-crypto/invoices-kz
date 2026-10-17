// «Заголовок страницы — INVOICES.KZ»: так называется вкладка каждой страницы кабинета.
export const SITE_TITLE_SUFFIX = 'INVOICES.KZ'

export function pageDocumentTitle(title: string): string {
  return `${title.trim()} — ${SITE_TITLE_SUFFIX}`
}
