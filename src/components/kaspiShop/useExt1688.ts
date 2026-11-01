'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EXT_PAGE_SOURCE, EXT_SOURCE, parseExtEvent, type ExtErrorReason, type ExtOffer,
} from '@/lib/kaspiShop/ext1688'

// Связь с расширением Chrome «invoices.kz: помощник поиска на 1688» (см. lib/kaspiShop/ext1688.ts
// и extension/invoices-1688). Определяет, установлено ли оно, запускает поиск и отдаёт состояние.

export type ExtPhase =
  | { kind: 'checking' }
  | { kind: 'absent' }
  | { kind: 'idle'; version: string }
  | { kind: 'searching'; query: string }
  | { kind: 'captcha'; query: string }
  | { kind: 'attention'; query: string }
  | { kind: 'done'; query: string; items: ExtOffer[] }
  | { kind: 'error'; query: string; reason: ExtErrorReason }

/** Страница ждёт ответа не дольше этого: у расширения свой таймаут 3 минуты, это запас на случай молчания. */
const PAGE_TIMEOUT_MS = 200_000
/** Расширение должно подтвердить запуск почти сразу; молчание значит, что оно пропало или обновлено. */
const STARTED_MS = 5_000
const DETECT_MS = 1_200

const newId = () => `ik-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export function useExt1688(): { phase: ExtPhase; search: (query: string) => void; cancel: () => void } {
  const [phase, setPhase] = useState<ExtPhase>({ kind: 'checking' })
  const version = useRef<string | null>(null)
  const active = useRef<{ id: string; query: string; timer: ReturnType<typeof setTimeout>; started: ReturnType<typeof setTimeout> | null } | null>(null)

  const post = useCallback((payload: Record<string, unknown>) => {
    window.postMessage({ source: EXT_PAGE_SOURCE, ...payload }, window.location.origin)
  }, [])

  /** Забыть текущий поиск; withCancel: ещё и попросить расширение закрыть вкладку 1688. */
  const stopActive = useCallback((withCancel: boolean) => {
    const cur = active.current
    if (!cur) return
    clearTimeout(cur.timer)
    if (cur.started) clearTimeout(cur.started)
    active.current = null
    if (withCancel) post({ type: 'ik1688:cancel', id: cur.id })
  }, [post])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      const d = e.data as { source?: unknown; type?: unknown; version?: unknown } | null
      if (!d || d.source !== EXT_SOURCE) return

      if (d.type === 'ik1688:pong') {
        version.current = typeof d.version === 'string' ? d.version.slice(0, 20) : '?'
        setPhase(p => (p.kind === 'checking' || p.kind === 'absent' ? { kind: 'idle', version: version.current as string } : p))
        return
      }
      const cur = active.current
      if (!cur) return
      const ev = parseExtEvent(e.data, cur.id)
      if (!ev) return
      if (cur.started) { clearTimeout(cur.started); cur.started = null }
      if (ev.status === 'captcha') setPhase({ kind: 'captcha', query: cur.query })
      else if (ev.status === 'attention') setPhase({ kind: 'attention', query: cur.query })
      else if (ev.status === 'results') { stopActive(false); setPhase({ kind: 'done', query: cur.query, items: ev.items ?? [] }) }
      else if (ev.status === 'error') { stopActive(false); setPhase({ kind: 'error', query: cur.query, reason: ev.reason ?? 'unknown' }) }
    }
    window.addEventListener('message', onMessage)
    post({ type: 'ik1688:ping' })
    const detect = setTimeout(() => setPhase(p => (p.kind === 'checking' ? { kind: 'absent' } : p)), DETECT_MS)
    return () => { window.removeEventListener('message', onMessage); clearTimeout(detect); stopActive(true) }
  }, [post, stopActive])

  const search = useCallback((query: string) => {
    if (!version.current) return
    stopActive(true)
    const id = newId()
    const timer = setTimeout(() => {
      if (active.current?.id === id) { stopActive(true); setPhase({ kind: 'error', query, reason: 'page_timeout' }) }
    }, PAGE_TIMEOUT_MS)
    const started = setTimeout(() => {
      if (active.current?.id === id) { stopActive(true); setPhase({ kind: 'error', query, reason: 'extension_unavailable' }) }
    }, STARTED_MS)
    active.current = { id, query, timer, started }
    setPhase({ kind: 'searching', query })
    post({ type: 'ik1688:search', id, queries: [query] })
  }, [post, stopActive])

  const cancel = useCallback(() => {
    if (!active.current) return
    stopActive(true)
    setPhase({ kind: 'idle', version: version.current ?? '?' })
  }, [stopActive])

  return { phase, search, cancel }
}
