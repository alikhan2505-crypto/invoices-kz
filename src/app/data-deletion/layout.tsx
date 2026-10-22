import type { Metadata } from 'next'

// Страница -- 'use client' (кнопке «Назад» нужен router), export metadata из неё
// не работает, поэтому свои title/description/canonical живут здесь. Адрес
// указан в настройках Meta-приложения как «Data Deletion Instructions URL» и
// остаётся доступным для индекса, как /privacy и /terms.
export const metadata: Metadata = {
  title: 'Удаление аккаунта и данных | invoices.kz',
  description: 'Как удалить аккаунт invoices.kz и все данные: письмо на mail@invoices.kz, срок удаления до 30 дней, что удаляется и что хранится по закону.',
  alternates: { canonical: 'https://invoices.kz/data-deletion' },
  robots: { index: true, follow: true },
}

export default function DataDeletionLayout({ children }: { children: React.ReactNode }) {
  return children
}
