'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Cloudflare Turnstile для входа по ссылке (Supabase Auth CAPTCHA). Виджет
// «interaction-only»: обычному человеку не виден, проверка идёт в фоне.
// Токен одноразовый — после каждой отправки вызываем reset().
interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT_SRC
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => { scriptPromise = null; reject(new Error('turnstile script failed')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

export interface TurnstileHandle { reset: () => void }

interface Props {
  siteKey: string
  onToken: (token: string | null) => void
}

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(function TurnstileWidget({ siteKey, onToken }, ref) {
  const box = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null)
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
    },
  }), [])

  useEffect(() => {
    let cancelled = false
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile || widgetId.current) return
      widgetId.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      })
    }).catch(() => onTokenRef.current(null))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) { try { window.turnstile.remove(widgetId.current) } catch {} }
      widgetId.current = null
    }
  }, [siteKey])

  return <div ref={box} className="flex justify-center mt-3" />
})
