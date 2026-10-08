'use client'
import { useEffect, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { clearDemo } from '@/lib/cfo/data'
import { useCfo } from './CfoWorkspace'

// Пока в кабинете лежит пример — плашка внизу экрана на всех страницах с выходом из него.
export default function DemoBanner() {
  const { ws, reload } = useCfo()
  const { confirm, dialogElement } = useAppDialog()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Пока плашка видна, страницы кабинета получают запас снизу (см. .cfo-page-content в globals.css).
  useEffect(() => {
    if (!ws.hasDemo) return
    document.body.dataset.cfoDemo = '1'
    return () => { delete document.body.dataset.cfoDemo }
  }, [ws.hasDemo])
  if (!ws.hasDemo) return null

  async function clear() {
    if (busy || !(await confirm('Удалить пример? Удалятся счета «(пример)» и все операции, повторы и план примера.'))) return
    setBusy(true)
    setError(null)
    try {
      await clearDemo(ws)
      await reload()
    } catch (e) {
      await reload().catch(() => {})
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Диалог — вне плашки: у неё transform, а fixed внутри transform привязывается к ней, а не к экрану.
  return (
    <>
    <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-4 z-50 w-[calc(100%-32px)] max-w-xl rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap shadow-lg" style={{ background: 'var(--nav-surface-chrome)', border: '1px solid var(--nav-accent)' }}>
      <span className="text-sm flex-1 min-w-[180px]" style={{ color: 'var(--nav-text-primary)' }}>
        Это пример с выдуманными цифрами. {error && <span style={{ color: 'var(--nav-critical)' }}>{error}</span>}
      </span>
      <button type="button" disabled={busy} onClick={() => void clear()} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
        {busy ? 'Удаляю…' : 'Очистить и начать свой учёт'}
      </button>
    </div>
    {dialogElement}
    </>
  )
}
