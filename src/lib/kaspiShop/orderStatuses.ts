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

// CORRECTED 2026-08-26 (founder caught this live, confirmed against the
// real cabinet + mobile app): an order sitting in Упаковка has NO накладная
// yet -- Kaspi only generates one once the seller confirms packing via «Я
// упаковал, сформировать накладные», which is itself the action that moves
// the order to Передача (captured live: POST .../order/cargo/assembled,
// see docs/superpowers/specs/2026-08-26-kaspi-packing-confirm-api-findings.md).
// Printing накладные straight from Упаковка (the previous BULK_PRINTABLE_STATUSES
// bug) always failed with Kaspi's empty-ZIP response for exactly this reason.
// Both statuses still support checkbox-selection + a bulk action -- they
// just take DIFFERENT actions now, so this list only gates the shared
// selection UI (date filter, checkbox bar), not which button renders.
export const BULK_SELECTABLE_STATUSES: string[] = [PACKING_STATUS, TRANSFER_STATUS]
// Waybill printing (Скачать А4/А6) is valid ONLY on Передача -- накладные
// exist there and nowhere else in the order lifecycle.
export const WAYBILL_PRINTABLE_STATUSES: string[] = [TRANSFER_STATUS]
