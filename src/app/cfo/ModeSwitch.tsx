'use client'
import { useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { setMode } from '@/lib/cfo/data'
import type { CfoMode } from '@/lib/cfo/mode'
import { useCfo } from './CfoWorkspace'
import { ErrorText, GhostButton, Segmented } from './ui'

// Переключение «Бизнес / Семейный бюджет» в настройках: меняет статьи и слова, данные не трогает.
export default function ModeSwitch() {
  const { ws, reload } = useCfo()
  const { confirm, dialogElement } = useAppDialog()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mode: CfoMode = ws.mode ?? 'business'

  // Повторный прогон для уже семейного кабинета: убрать дубли своих статей и бизнес-группы.
  async function tidy() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await setMode(ws, 'family')
      await reload()
    } catch (e) {
      await reload().catch(() => {})
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

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
      <div className="flex gap-2 flex-wrap items-center">
        <Segmented label="Для чего кабинет" value={mode} onChange={(v) => void change(v)} options={[{ value: 'business', label: 'Бизнес' }, { value: 'family', label: 'Семейный бюджет' }]} />
        {mode === 'family' && <GhostButton type="button" disabled={busy} onClick={() => void tidy()}>{busy ? 'Навожу порядок…' : 'Навести порядок в статьях'}</GhostButton>}
      </div>
      <ErrorText>{error}</ErrorText>
      {dialogElement}
    </div>
  )
}
