'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import Skeleton from '@/components/Skeleton'
import { useAppDialog } from '@/components/AppDialog'
import { useLanguage } from '@/components/LanguageProvider'
import PageContainer, { TILE_LIST_CLS, TILE_GRID_CLS, TILE_ITEM_CLS } from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'
import { binWatchDict } from '@/lib/i18n/binWatch'
import { BIN_WATCH_LIMITS } from '@/lib/binWatch/config'
import { BIN_WATCH_PAGE_PATH, consumePendingBinWatch } from '@/lib/binWatch/pendingIntent'
import { summarize, type WatchDetails, type WatchSignals } from '@/lib/binWatch/signals'
import { isValidBin, normalizeBin } from '@/lib/binLookup'
import { setPostLoginRedirect } from '@/lib/postLoginRedirect'
import { formatIsoDate, formatTenge } from '@/lib/tools-i18n'

// /profile/bin-watch: список БИН на слежении (решение основателя 29.10.2026).
// Пока включён админ-гейт (src/lib/binWatch/config.ts), сервер отвечает 403
// admin_only, и страница показывает «раздел пока недоступен». Данные идут только
// через /api/bin-watch (личность из Bearer-токена, чужие строки недоступны).

const EASE = [0.16, 1, 0.3, 1] as const

interface Item {
  id: string
  bin: string
  name: string | null
  createdAt: string
  lastCheckedAt: string | null
  lastStatus: 'ok' | 'not_found' | 'unavailable' | null
  signals: WatchSignals | null
  details: WatchDetails | null
}

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; items: Item[]; limit: number }

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  )
}
function EyeIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--nav-text-muted)' }} aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

const inputClass = 'flex-1 min-w-[180px] rounded-lg px-3 py-2.5 text-sm font-mono tracking-wider outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

export default function BinWatchPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = binWatchDict[lang]
  const reduceMotion = !!useReducedMotion()
  const { confirm, dialogElement } = useAppDialog()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [bin, setBin] = useState('')
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const intentDone = useRef(false)

  const token = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  const fetchList = useCallback(async (): Promise<Load> => {
    const at = await token()
    if (!at) {
      // Сессии нет: после входа вернёмся сюда (путь в списке разрешённых возвратов).
      setPostLoginRedirect(BIN_WATCH_PAGE_PATH)
      router.push('/login')
      return { kind: 'loading' }
    }
    try {
      const res = await fetch('/api/bin-watch', { headers: { Authorization: `Bearer ${at}` } })
      if (res.status === 401) { setPostLoginRedirect(BIN_WATCH_PAGE_PATH); router.push('/login'); return { kind: 'loading' } }
      if (res.status === 403) return { kind: 'unavailable' }
      const data = await res.json().catch(() => ({}))
      if (res.status === 503 && data?.error === 'not_ready') return { kind: 'unavailable' }
      if (!res.ok) return { kind: 'error' }
      return { kind: 'ready', items: data.items as Item[], limit: Number(data.limit) || BIN_WATCH_LIMITS.free }
    } catch {
      return { kind: 'error' }
    }
  }, [router, token])

  const reload = useCallback(async () => {
    const next = await fetchList()
    if (next.kind !== 'loading') setLoad(next)
  }, [fetchList])

  const addBin = useCallback(async (raw: string): Promise<'ok' | 'invalid' | 'limit' | 'fail'> => {
    const digits = normalizeBin(raw)
    if (!isValidBin(digits)) return 'invalid'
    const at = await token()
    if (!at) return 'fail'
    try {
      const res = await fetch('/api/bin-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
        body: JSON.stringify({ bin: digits }),
      })
      if (res.ok) return 'ok'
      const data = await res.json().catch(() => ({}))
      return data?.error === 'limit' ? 'limit' : 'fail'
    } catch {
      return 'fail'
    }
  }, [token])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const first = await fetchList()
      if (cancelled || first.kind === 'loading') return
      setLoad(first)
      // Намерение «добавить после входа» (кнопка на бесплатном инструменте).
      if (first.kind === 'ready' && !intentDone.current) {
        intentDone.current = true
        const pending = consumePendingBinWatch()
        if (pending) {
          const res = await addBin(pending)
          if (cancelled) return
          setMessage(res === 'ok' ? { tone: 'ok', text: t.intentAdded }
            : res === 'limit' ? { tone: 'bad', text: t.limitReached(first.limit) }
            : { tone: 'bad', text: t.intentFailed })
          if (res === 'ok') await reload()
        }
      }
    })()
    return () => { cancelled = true }
    // Язык может поменяться, а добавление по намерению должно сработать один раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onAdd() {
    if (adding) return
    setMessage(null)
    setAdding(true)
    let res: Awaited<ReturnType<typeof addBin>>
    try { res = await addBin(bin) } finally { setAdding(false) }
    if (res === 'invalid') { setMessage({ tone: 'bad', text: t.invalidBin }); return }
    if (res === 'limit') { setMessage({ tone: 'bad', text: t.limitReached(load.kind === 'ready' ? load.limit : BIN_WATCH_LIMITS.free) }); return }
    if (res === 'fail') { setMessage({ tone: 'bad', text: t.errGeneric }); return }
    setBin('')
    await reload()
  }

  async function onRemove(item: Item) {
    if (!(await confirm(t.removeConfirm(item.name || item.bin)))) return
    const at = await token()
    try {
      const res = await fetch(`/api/bin-watch?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${at || ''}` },
      })
      if (!res.ok && res.status !== 404) { setMessage({ tone: 'bad', text: t.removeError }); return }
      setLoad(cur => (cur.kind === 'ready' ? { ...cur, items: cur.items.filter(i => i.id !== item.id) } : cur))
    } catch {
      setMessage({ tone: 'bad', text: t.removeError })
    }
  }

  const ready = load.kind === 'ready' ? load : null

  return (
    <>
      <PageContainer variant="wide">
        <PageHeader title={t.pageTitle} subtitle={t.pageSubtitle} backHref="/profile" />

        {load.kind === 'unavailable' && (
          <div className="nav-glass rounded-2xl p-5 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{t.notAvailable}</div>
        )}

        {load.kind === 'error' && (
          <div className="nav-glass rounded-2xl p-5 flex flex-wrap items-center gap-3" role="alert">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{t.loadError}</span>
            <button type="button" onClick={() => { setLoad({ kind: 'loading' }); void reload() }}
              className="text-sm font-semibold min-h-11 px-3" style={{ color: 'var(--nav-accent)' }}>
              {t.retry}
            </button>
          </div>
        )}

        {load.kind === 'loading' && (
          <div className={`${TILE_LIST_CLS} max-lg:mb-4`}>
            <div className={`${TILE_GRID_CLS} lg:mb-4`}>
              {[0, 1, 2].map(i => (
                <div key={i} className={`px-4 py-3.5 ${TILE_ITEM_CLS}`}>
                  <Skeleton className="h-4 w-40 mb-2" />
                  <Skeleton className="h-3 w-28 mb-2" />
                  <Skeleton className="h-3 w-52" />
                </div>
              ))}
            </div>
          </div>
        )}

        {ready && (
          <>
            <div className="nav-glass rounded-2xl p-4 mb-4 lg:max-w-2xl">
              <div className="flex flex-wrap gap-2">
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={t.addPlaceholder}
                  placeholder={t.addPlaceholder}
                  value={bin}
                  onChange={e => setBin(normalizeBin(e.target.value).slice(0, 12))}
                  onKeyDown={e => { if (e.key === 'Enter') void onAdd() }}
                  className={inputClass}
                  style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-glass)' }}
                />
                <button type="button" onClick={() => void onAdd()} disabled={adding || !isValidBin(bin)}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold min-h-11 disabled:opacity-50 transition-transform hover:-translate-y-0.5"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {adding ? t.buttonAdding : t.addButton}
                </button>
              </div>
              <div className="text-xs mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                <span className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.counter(ready.items.length, ready.limit)}</span>
                {' · '}{t.planNote(BIN_WATCH_LIMITS.free, BIN_WATCH_LIMITS.pro)}
              </div>
              <div aria-live="polite">
                {message && (
                  <div className="text-[13px] mt-2" role={message.tone === 'bad' ? 'alert' : 'status'}
                    style={{ color: message.tone === 'bad' ? 'var(--nav-critical)' : 'var(--nav-success)' }}>
                    {message.text}
                  </div>
                )}
              </div>
            </div>

            {ready.items.length === 0 ? (
              <div className="flex flex-col items-center text-center py-12">
                <EyeIcon />
                <p className="text-sm font-semibold mt-3" style={{ color: 'var(--nav-text-primary)' }}>{t.emptyTitle}</p>
                <p className="text-sm mt-1 max-w-md" style={{ color: 'var(--nav-text-secondary)' }}>{t.emptyBody}</p>
              </div>
            ) : (
              <div className={`${TILE_LIST_CLS} max-lg:mb-4`}>
                <div className={`${TILE_GRID_CLS} lg:mb-4`}>
                  {ready.items.map((item, i) => {
                    const summary = summarize(item.signals && item.details ? { signals: item.signals, details: item.details } : null)
                    const failedLast = item.lastStatus === 'unavailable' || item.lastStatus === 'not_found'
                    const tone = !summary ? 'muted' : summary.bad.length ? 'bad' : summary.unchecked.length ? 'muted' : 'ok'
                    const color = tone === 'bad' ? 'var(--nav-critical)' : tone === 'ok' ? 'var(--nav-success)' : 'var(--nav-text-muted)'
                    const checked = formatIsoDate(item.lastCheckedAt)
                    return (
                      <motion.div key={item.id}
                        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: reduceMotion ? 0 : Math.min(i * 0.035, 0.4), duration: reduceMotion ? 0 : 0.35, ease: EASE }}
                        className={`flex items-start px-4 py-3.5 transition-colors ${TILE_ITEM_CLS}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm break-words" style={{ color: 'var(--nav-text-primary)' }}>
                            {item.name || t.unknownName}
                          </div>
                          <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--nav-text-muted)' }}>{t.binPrefix(item.bin)}</div>

                          {summary ? (
                            <div className="mt-2 space-y-1">
                              <div className="text-[13px] font-semibold" style={{ color }}>
                                {summary.bad.length ? t.statusRisks : summary.unchecked.length ? t.statusPartial : t.statusClean}
                              </div>
                              {summary.bad.map(k => (
                                <div key={k} className="text-[12px]" style={{ color: 'var(--nav-critical)' }}>
                                  {t.signals[k]}
                                  {k === 'taxDebt' && item.details?.totalArrear ? `: ${t.arrear(formatTenge(item.details.totalArrear))}` : ''}
                                  {k === 'enforcement' && item.details?.enforcementCount ? `: ${t.enforcement(item.details.enforcementCount, item.details.enforcementActive ?? 0)}` : ''}
                                </div>
                              ))}
                              {summary.unchecked.length > 0 && (
                                <div className="text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>
                                  {t.statusUnchecked(summary.unchecked.map(k => t.signals[k]).join(', '))}
                                </div>
                              )}
                              {failedLast && <div className="text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>{t.lastAttemptFailed}</div>}
                            </div>
                          ) : (
                            <div className="text-[12px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                              {failedLast ? t.lastAttemptFailed : t.neverChecked}
                            </div>
                          )}

                          {checked && <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>{t.lastChecked(checked)}</div>}
                        </div>
                        <button type="button" onClick={() => void onRemove(item)}
                          aria-label={`${t.remove}: ${item.name || item.bin}`} title={t.remove}
                          className="w-11 h-11 -mr-2 ml-2 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                          style={{ color: 'var(--nav-text-muted)' }}>
                          <TrashIcon />
                        </button>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )}

            <p className="text-xs max-w-2xl" style={{ color: 'var(--nav-text-muted)' }}>
              {t.emailNote}{' '}
              <Link href="/profile/notifications" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>{t.notificationsLink}</Link>
            </p>
          </>
        )}
      </PageContainer>
      {dialogElement}
    </>
  )
}
