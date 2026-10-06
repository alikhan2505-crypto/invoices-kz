// src/app/print/page.tsx
import type { Metadata } from 'next'
import PrintShopClient from './PrintShopClient'

export const metadata: Metadata = {
  title: 'Именные 3D-брелки на заказ — invoices.kz',
  description: 'Настройте именной брелок: шрифт, цвета, размер — и закажите с оплатой Kaspi Pay.',
}

export default function PrintShopPage() {
  return <PrintShopClient />
}
