// src/app/print/page.tsx
import type { Metadata } from 'next'
import PrintShopClient from './PrintShopClient'
import { NOINDEX_ROBOTS } from '@/lib/noindex'

export const metadata: Metadata = {
  title: 'Именные 3D-брелки на заказ — invoices.kz',
  description: 'Настройте именной брелок: шрифт, цвета, размер — и закажите с оплатой Kaspi Pay.',
  // Личная витрина основателя, не часть продукта invoices.kz: из поиска закрыта.
  robots: NOINDEX_ROBOTS,
  alternates: { canonical: 'https://invoices.kz/print' },
}

export default function PrintShopPage() {
  return <PrintShopClient />
}
