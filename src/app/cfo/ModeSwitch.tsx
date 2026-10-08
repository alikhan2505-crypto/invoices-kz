'use client'
import { useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { setMode } from '@/lib/cfo/data'
import type { CfoMode } from '@/lib/cfo/mode'
import { useCfo } from './CfoWorkspace'
import { ErrorText, Segmented } from './ui'

// Переключение «Бизнес / Семейный бюджет» в настройках: меняет статьи и слова, данные не трогает.
export default function ModeSwitch() {
  const { ws, reload } = useCfo()
  const { confirm, dialogElement } = useAppDialog()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mode: CfoMode = ws.mode ?? 'business'

  async function change(next: CfoMode) {
    if (busy || next === mode) return
    const text = next === 'family'
      ? 'Переключить на семейный бюджет? Появятся статьи «Продукты», «Транспорт», «Дети»… Неиспользуемые бизнес-статьи уйдут в архив, операции и отчёты сохранятся.'
      : 'Переключить на бизнес? Вернутся бизнес-статьи, неиспользуемые семейные уйдут в архив. Операции и отчёты сохранятся.'
    if (!(await confirm(text))) return
    setBusy(true)
    setError(null)
    try {
      await setMode(ws, next)
      await reload()
    } catch (e) {
      await reload().catch(() => {})
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3">
      <Segmented label="Для чего кабинет" value={mode} onChange={(v) => void change(v)} options={[{ value: 'business', label: 'Бизнес' }, { value: 'family', label: 'Семейный бюджет' }]} />
      <ErrorText>{error}</ErrorText>
      {dialogElement}
    </div>
  )
}
