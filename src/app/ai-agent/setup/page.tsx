import type { Metadata } from 'next'
import SetupWizard from './SetupWizard'

// Мастер «сначала канал» (16.10.2026). Серверная обёртка -- ловушка Next 16:
// экспорт route segment config (dynamic и т.п.) из файла с 'use client'
// молча не работает, поэтому вся клиентская часть -- в SetupWizard.tsx, а
// здесь только то, что принадлежит сегменту маршрута.
export const metadata: Metadata = {
  title: 'Новый AI-агент | invoices.kz',
  robots: { index: false, follow: false },
}

export default function AiAgentSetupPage() {
  return <SetupWizard />
}
