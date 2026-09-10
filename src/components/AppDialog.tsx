'use client'
import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'

// In-app replacements for window.alert and window.confirm.
//
// The native ones render as "invoices.kz сообщает:" system boxes, which on a
// phone read as a browser failure rather than part of the product — and they
// were carrying the most important moments in the funnel: "заполните
// реквизиты" and "не заполнены банковские реквизиты", the two gates 19
// stalled accounts hit.
//
// The hook deliberately names its functions `alert` and `confirm`. Inside a
// component that calls the hook they shadow the globals, so every existing
// call is converted by the import alone and none can be missed by accident.
// The trade: `confirm` now returns a Promise<boolean>, so `if (confirm(x))`
// would be silently always-true. Every confirm site must be awaited — there
// is no way for the compiler to catch it, so it is called out here.

type DialogState = {
  text: string
  kind: 'alert' | 'confirm'
  resolve: (value: boolean) => void
}

export function useAppDialog() {
  const [state, setState] = useState<DialogState | null>(null)

  const alert = useCallback((text: string) => {
    return new Promise<void>(resolve => {
      setState({ text, kind: 'alert', resolve: () => resolve() })
    })
  }, [])

  const confirm = useCallback((text: string) => {
    return new Promise<boolean>(resolve => {
      setState({ text, kind: 'confirm', resolve })
    })
  }, [])

  const close = useCallback((value: boolean) => {
    setState(current => {
      current?.resolve(value)
      return null
    })
  }, [])

  // Portalled to the body so a dialog opened from deep inside a form is not
  // clipped by an ancestor's overflow or stacking context.
  const dialogElement = state && typeof document !== 'undefined'
    ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(15, 17, 23, 0.55)' }}
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-xl"
            style={{ background: 'var(--nav-surface-card, #ffffff)', color: 'var(--nav-text-primary, #111827)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-sm leading-relaxed whitespace-pre-line">{state.text}</div>
            <div className="flex gap-2 mt-5">
              {state.kind === 'confirm' && (
                <button
                  onClick={() => close(false)}
                  className="flex-1 rounded-xl py-3 text-sm font-medium"
                  style={{ background: 'var(--nav-surface-glass, #f3f4f6)', color: 'var(--nav-text-secondary, #6b7280)' }}>
                  Отмена
                </button>
              )}
              <button
                autoFocus
                onClick={() => close(true)}
                className="flex-1 rounded-xl py-3 text-sm font-semibold"
                style={{ background: 'var(--nav-accent, #1C2056)', color: 'var(--nav-accent-ink, #ffffff)' }}>
                {state.kind === 'confirm' ? 'Продолжить' : 'Понятно'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  return { alert, confirm, dialogElement }
}
