import type { Metadata } from 'next'
import TermsContent from './TermsContent'

// 'export const metadata' не работает в файле с 'use client', поэтому страница --
// серверная обёртка (свои title/description/canonical), а видимое содержимое
// живёт в клиентском TermsContent (кнопке «Назад» нужен router).
export const metadata: Metadata = {
  title: 'Условия сервиса и публичная оферта | invoices.kz',
  description: 'Публичная оферта invoices.kz: аккаунт, тарифы и оплата, допустимое использование, ИИ-функции, ответственность и применимое право Республики Казахстан.',
  alternates: { canonical: 'https://invoices.kz/terms' },
  robots: { index: true, follow: true },
}

export default function TermsPage() {
  return <TermsContent />
}