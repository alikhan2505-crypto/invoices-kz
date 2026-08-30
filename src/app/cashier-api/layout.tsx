import type { Metadata } from 'next'

// The root layout (src/app/layout.tsx) sets a metadata title/description
// aimed at the accounting-software buyer ("INVOICES.KZ -- Счета, АВР, КП и
// Накладные..."), which would otherwise be inherited here verbatim. This
// page targets a completely different audience (developers integrating
// Kaspi Pay), so it needs its own segment-level override.
export const metadata: Metadata = {
  title: 'Kaspi Cashier API — invoices.kz',
  description: 'Принимайте Kaspi Pay на своём сайте: создание платежа, QR-ссылка и вебхук об оплате. 2% с оплаченного — без абонплаты и минимального оборота.',
}

export default function CashierApiLayout({ children }: { children: React.ReactNode }) {
  return children
}
