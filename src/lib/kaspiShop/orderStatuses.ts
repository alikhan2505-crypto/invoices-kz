// Real status codes, read off the cabinet's own sidebar nav links (see
// docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md, section
// 4). Возвраты is a separate query family (refunds, not orders) per the
// same findings doc -- out of scope here, not wired up as a dead tab.
// Shared between the orders page and the sidebar's status subnav so both
// render the exact same list.
export const ORDER_STATUS_TABS: { label: string; value: string }[] = [
  { label: 'Новые', value: 'NEW' },
  { label: 'На подписании', value: 'SIGN_REQUIRED' },
  { label: 'Самовывоз', value: 'PICKUP' },
  { label: 'Моя доставка', value: 'DELIVERY' },
  { label: 'Предзаказ', value: 'KASPI_DELIVERY_WAIT_FOR_POINT_DELIVERY' },
  { label: 'Упаковка', value: 'KASPI_DELIVERY_CARGO_ASSEMBLY' },
  { label: 'Передача', value: 'KASPI_DELIVERY_WAIT_FOR_COURIER' },
  { label: 'Переданы на доставку', value: 'KASPI_DELIVERY_TRANSMITTED' },
  { label: 'Отменены при доставке', value: 'KASPI_DELIVERY_RETURN_REQUEST' },
  { label: 'Архив', value: 'ARCHIVED' },
]

export const TRANSFER_STATUS = 'KASPI_DELIVERY_WAIT_FOR_COURIER'
export const PACKING_STATUS = 'KASPI_DELIVERY_CARGO_ASSEMBLY'

// Bulk "select orders, print all their waybills as one PDF" is available on
// both statuses (founder request 2026-08-22, "у конкурентов в разделе
// упаковка должно быть распечатка накладных все вместе" -- sellers print
// the shipping label while physically packing the box, not only later at
// the transfer-to-courier step). Kept as its own list rather than inlining
// the OR at each call site, since a future status (e.g. self-pickup prep)
// may need the same bulk-print affordance.
export const BULK_PRINTABLE_STATUSES: string[] = [PACKING_STATUS, TRANSFER_STATUS]
