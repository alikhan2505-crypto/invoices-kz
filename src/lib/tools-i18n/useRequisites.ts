'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@vercel/analytics'
import type { ToolEventTool } from '@/lib/toolEvents/schema'
import type { ToolLang } from './index'
import { logToolEvent } from './toolEvents'
import {
  clearRequisites, hasRequisites, loadRequisites, saveRequisites, type Requisites,
} from './requisites'

const SAVE_DEBOUNCE_MS = 600

/**
 * Реквизиты поставщика, общие для четырёх документов /tools (см. requisites.ts).
 * Подстановку в пустые поля делает сам инструмент в эффекте чтения черновика
 * (applyRequisites), чтобы форма выставлялась за один setState; хук отвечает за
 * остальное: сохранить срез формы (с задержкой, и только когда есть 12-значный БИН),
 * показать «запомнено» и очистить.
 */
export function useRequisites(opts: {
  tool: ToolEventTool
  lang: ToolLang
  /** Черновик и сохранённое уже прочитаны: до этого ничего не пишем. */
  ready: boolean
  /** Срез формы: только поля поставщика, которые есть у этого инструмента. */
  picked: Requisites
}) {
  const { tool, lang, ready, picked } = opts
  const [hasSaved, setHasSaved] = useState(false)
  const reported = useRef(false)

  useEffect(() => {
    if (!ready) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasSaved(hasRequisites(loadRequisites()))
  }, [ready])

  const serialized = JSON.stringify(picked)
  useEffect(() => {
    if (!ready) return
    const bin = String(picked.binIin ?? '').replace(/\D/g, '')
    if (bin.length !== 12) return
    const timer = setTimeout(() => {
      if (saveRequisites(picked)) setHasSaved(true)
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // picked приходит новым объектом на каждый рендер: следим за его содержимым.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, serialized])

  /** Сообщить, что при открытии в пустые поля легли запомненные реквизиты (событие раз за страницу). */
  const noteApplied = useCallback((count: number) => {
    if (count <= 0 || reported.current) return
    reported.current = true
    track('tool_form_saved_applied', { tool, lang, fields: count })
    logToolEvent('tool_form_saved_applied', tool, { lang })
  }, [tool, lang])

  /** Забыть реквизиты (общий ключ и поля поставщика в черновиках); `reset` обнуляет поля на экране. */
  const clear = useCallback((reset: () => void) => {
    clearRequisites()
    setHasSaved(false)
    reset()
  }, [])

  return { hasSaved, noteApplied, clear }
}
