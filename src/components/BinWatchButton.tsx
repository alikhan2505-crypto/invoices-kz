'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { mightHaveStoredSession } from '@/lib/hasStoredSession'
import { binWatchDict, type BinWatchLang } from '@/lib/i18n/binWatch'
import { canUseBinWatch } from '@/lib/binWatch/config'
import { BIN_WATCH_PAGE_PATH, setPendingBinWatch } from '@/lib/binWatch/pendingIntent'
import { setPostLoginRedirect } from '@/lib/postLoginRedirect'

// Кнопка «Следить за этим БИН» под результатом проверки контрагента
// (/tools/kontragent на трёх языках и /create). Вошедшему добавляет БИН через
// POST /api/bin-watch; невошедшего ведёт на /login с возвратом на список
// слежения и намерением добавить (src/lib/binWatch/pendingIntent.ts). Пока
// включён админ-гейт (src/lib/binWatch/config.ts) кнопка видна только вошедшему
// админу; анонимный посетитель её не видит вовсе.
//
// Язык приходит пропсом (на публичных страницах он берётся из адреса, а не из
// куки). supabase-js подгружается только если в браузере есть сохранённая сессия:
// анонимные посетители (почти весь поисковый трафик) его не скачивают.

interface Viewer {
  ready: boolean
  signedIn: boolean
  isAdmin: boolean
}

function useViewer(): Viewer {
  const [state, setState] = useState<Viewer>({ ready: false, signedIn: false, isAdmin: false })
  useEffect(() => {
    let cancelled = false
    if (!mightHaveStoredSession()) { setState({ ready: true, signedIn: false, isAdmin: false }); return }
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { setState({ ready: true, signedIn: false, isAdmin: false }); return }
        let isAdmin = false
        try {
          // Своя строка: RLS разрешает. Любая ошибка = не админ (кнопка скрыта, гейт закрыт).
          const { data } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle()
          isAdmin = data?.is_admin === true
        } catch { isAdmin = false }
        if (!cancelled) setState({ ready: true, signedIn: true, isAdmin })
      } catch {
        if (!cancelled) setState({ ready: true, signedIn: false, isAdmin: false })
      }
    })()
    return () => { cancelled = true }
  }, [])
  return state
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'adding' }
  | { kind: 'added' }
  | { kind: 'already' }
  | { kind: 'error'; message: string }

export default function BinWatchButton({ bin, lang, onSignInClick, className }: {
  bin: string
  lang: BinWatchLang
  /** Вызывается перед уходом анонима на /login (на публичных страницах: запомнить язык страницы, аналитика). */
  onSignInClick?: () => void
  className?: string
}) {
  const t = binWatchDict[lang]
  const viewer = useViewer()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  // Другой БИН - другая кнопка.
  useEffect(() => { setPhase({ kind: 'idle' }) }, [bin])

  const add = useCallback(async () => {
    setPhase({ kind: 'adding' })
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/bin-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ bin }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setPhase({ kind: data?.status === 'already' ? 'already' : 'added' }); return }
      if (data?.error === 'limit') { setPhase({ kind: 'error', message: t.limitReached(Number(data?.limit) || 0) }); return }
      if (data?.error === 'not_ready') { setPhase({ kind: 'error', message: t.errNotReady }); return }
      setPhase({ kind: 'error', message: t.errGeneric })
    } catch {
      setPhase({ kind: 'error', message: t.errNetwork })
    }
  }, [bin, t])

  if (!viewer.ready || !/^\d{12}$/.test(bin)) return null
  if (!canUseBinWatch(viewer.isAdmin)) return null

  const signIn = () => {
    onSignInClick?.()
    setPendingBinWatch(bin)
    setPostLoginRedirect(BIN_WATCH_PAGE_PATH)
    window.location.assign(`/login?next=${encodeURIComponent(BIN_WATCH_PAGE_PATH)}&utm_source=bin_watch&utm_medium=button`)
  }

  const done = phase.kind === 'added' || phase.kind === 'already'
  return (
    <div className={className} data-bin-watch>
      <div className="flex flex-wrap items-center gap-2">
        {done ? (
          <>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--nav-success)' }} role="status">
              {phase.kind === 'already' ? t.buttonAlready : t.buttonAdded}
            </span>
            <Link href={BIN_WATCH_PAGE_PATH} className="text-[13px] font-semibold" style={{ color: 'var(--nav-accent)' }}>
              {t.openList}
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={viewer.signedIn ? add : signIn}
            disabled={phase.kind === 'adding'}
            className="nav-glass rounded-xl px-4 py-2.5 text-[13px] font-semibold min-h-11 transition-colors hover:bg-[var(--nav-surface-glass)] disabled:opacity-60"
            style={{ color: 'var(--nav-accent)', border: '1px solid var(--nav-border)' }}
          >
            {phase.kind === 'adding' ? t.buttonAdding : t.button}
          </button>
        )}
      </div>
      {!done && (
        <div className="text-[12px] mt-1.5" style={{ color: 'var(--nav-text-muted)' }}>
          {viewer.signedIn ? t.buttonHint : t.buttonSignInHint}
        </div>
      )}
      <div aria-live="polite">
        {phase.kind === 'error' && (
          <div className="text-[12px] mt-1.5" style={{ color: 'var(--nav-critical)' }} role="alert">{phase.message}</div>
        )}
      </div>
    </div>
  )
}
