import type { Metadata } from 'next'
import PrivacyContent from './PrivacyContent'

// 'export const metadata' не работает в файле с 'use client', поэтому страница --
// серверная обёртка (свои title/description/canonical), а видимое содержимое
// живёт в клиентском PrivacyContent (кнопке «Назад» нужен router).
export const metadata: Metadata = {
  title: 'Политика конфиденциальности | invoices.kz',
  description: 'Какие данные собирает invoices.kz, зачем, как долго хранит и кому передаёт, и какие у вас права по Закону РК «О персональных данных и их защите».',
  alternates: { canonical: 'https://invoices.kz/privacy' },
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return <PrivacyContent />
}