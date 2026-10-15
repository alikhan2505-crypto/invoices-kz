'use client'
import { useEffect, useRef } from 'react'
import type { ToolEventLang, ToolEventTool } from '@/lib/toolEvents/schema'
import { logToolEvent } from './toolEvents'

// 'view' — один раз на монтирование инструмента (ref переживает двойной
// запуск эффектов в StrictMode).
export function useToolView(tool: ToolEventTool, lang: ToolEventLang) {
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    logToolEvent('view', tool, { lang })
  }, [tool, lang])
}

// 'limit' — когда блок лимита стал виден, один раз на монтирование.
export function useToolLimitEvent(tool: ToolEventTool, lang: ToolEventLang, visible: boolean) {
  const sent = useRef(false)
  useEffect(() => {
    if (!visible || sent.current) return
    sent.current = true
    logToolEvent('limit', tool, { lang })
  }, [tool, lang, visible])
}
