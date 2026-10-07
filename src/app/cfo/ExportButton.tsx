'use client'
import { useCfo } from './CfoWorkspace'
import { GhostButton } from './ui'

// Выгрузка в Excel — функция тарифа Про; без Про кнопка ведёт на страницу тарифов.
export default function ExportButton({ onExport }: { onExport: () => void }) {
  const { pro } = useCfo()
  if (!pro) {
    return (
      <a href="/upgrade" title="Выгрузка в Excel — на тарифе Про" className="inline-flex items-center min-h-[44px] rounded-xl px-4 text-sm font-medium" style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-muted)' }}>
        Excel · Про
      </a>
    )
  }
  return <GhostButton type="button" onClick={onExport}>Скачать Excel</GhostButton>
}
