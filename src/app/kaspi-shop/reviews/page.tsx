'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Review = {
  rating: number
  text: string
  authorName: string | null
  date: string | null
  trackedProductId: string
  productName: string
}

type ReviewStats = { avgRating: number; total: number; negative: number; fiveStar: number }

type ReviewsResponse = {
  stats: ReviewStats
  reviews: Review[]
  lastFetchedAt: string | null
  productErrorCount: number
}

const STAR_PILLS: { label: string; value: number | null }[] = [
  { label: 'Все', value: null },
  { label: '5★', value: 5 },
  { label: '4★', value: 4 },
  { label: '3★', value: 3 },
  { label: '2★', value: 2 },
  { label: '1★', value: 1 },
]

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('ru-KZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('ru-KZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function KaspiShopReviews() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ReviewsResponse | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [activeStars, setActiveStars] = useState<number | null>(null)
  const [refreshNote, setRefreshNote] = useState('')

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading) loadReviews(activeStars) }, [activeStars, loading])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }
    setLoading(false)
  }

  async function loadReviews(stars: number | null) {
    setDataLoading(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const qs = stars !== null ? `?stars=${stars}` : ''
      const res = await fetch(`/api/kaspi-shop/reviews${qs}`, { headers })
      const json = await res.json()
      if (!res.ok) { setLoadError(json.error || 'Не удалось загрузить отзывы'); setData(null); return }
      setData(json)
    } catch {
      setLoadError('Не удалось загрузить отзывы. Проверьте соединение и попробуйте ещё раз.')
      setData(null)
    } finally {
      setDataLoading(false)
    }
  }

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

  // The actual per-product fetch now runs on a GitHub Actions relay (Kaspi
  // 429s this endpoint from Vercel's IP -- confirmed live 2026-08-21), so
  // POST here only dispatches the run and returns immediately; this polls
  // the normal GET on an interval so the list fills in as ingest calls land
  // instead of waiting for one long synchronous response the old direct-
  // fetch version returned.
  async function doRefresh() {
    setRefreshing(true)
    setLoadError('')
    setRefreshNote('')
    const dispatchedAt = new Date().toISOString()
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/reviews', { method: 'POST', headers })
      const json = await res.json()
      if (!res.ok) { setLoadError(json.error || 'Не удалось обновить отзывы'); return }

      setRefreshNote(`Проверяем ${json.dispatchedCount} товар(ов) на Kaspi — это может занять пару минут...`)

      // Poll budget scales with how many products are being checked (~1s
      // each on the relay side), capped so a stuck run doesn't poll forever.
      const maxAttempts = Math.min(60, Math.ceil(json.dispatchedCount * 2 / 3) + 15)
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await sleep(3000)
        const pollHeaders = await authHeader()
        const qs = activeStars !== null ? `?stars=${activeStars}` : ''
        const pollRes = await fetch(`/api/kaspi-shop/reviews${qs}`, { headers: pollHeaders })
        const pollJson = await pollRes.json().catch(() => null)
        if (pollRes.ok && pollJson) {
          setData(pollJson)
          if (pollJson.lastFetchedAt && pollJson.lastFetchedAt >= dispatchedAt) {
            setRefreshNote('')
            return
          }
        }
      }
      setRefreshNote('Обновление ещё идёт на стороне Kaspi — данные обновятся сами по мере поступления, попробуйте открыть страницу заново через минуту.')
    } catch {
      setLoadError('Не удалось обновить отзывы. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return <LoadingSpinner />

  const stats = data?.stats

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => loadReviews(activeStars)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Отзывы</div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Отзывы покупателей</h1>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <button onClick={doRefresh} disabled={refreshing}
                className="text-sm font-semibold rounded-xl px-4 py-2.5 disabled:opacity-50 transition-opacity"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {refreshing ? 'Обновляем...' : 'Обновить'}
              </button>
              {data?.lastFetchedAt && (
                <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>Обновлено: {formatDateTime(data.lastFetchedAt)}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <div className="text-lg font-bold font-mono tabular-nums flex items-center gap-1" style={{ color: 'var(--nav-text-primary)' }}>
                <StarIcon />{(stats?.avgRating ?? 0).toFixed(1)}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>средняя оценка</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{stats?.total ?? 0}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>всего отзывов</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: (stats?.negative ?? 0) > 0 ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}>{stats?.negative ?? 0}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>негативных (≤3★)</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{stats?.fiveStar ?? 0}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>5★ отзывов</div>
            </div>
          </div>

          {refreshNote && (
            <div className="text-[11px] mt-4 flex items-center gap-1.5" style={{ color: 'var(--nav-text-secondary)' }}>
              <WarnIcon /> {refreshNote}
            </div>
          )}
          {!refreshNote && !!data && data.productErrorCount > 0 && (
            <div className="text-[11px] mt-4 flex items-center gap-1.5" style={{ color: 'var(--nav-text-secondary)' }}>
              <WarnIcon /> По {data.productErrorCount} {data.productErrorCount === 1 ? 'товару' : 'товарам'} последнее обновление не удалось — данные могут быть устаревшими.
            </div>
          )}

          <div className="flex items-center gap-1 flex-wrap nav-glass rounded-full p-1 w-fit mt-6">
            {STAR_PILLS.map(pill => {
              const active = activeStars === pill.value
              return (
                <button key={pill.label} onClick={() => setActiveStars(pill.value)}
                  className="relative text-xs font-medium rounded-full px-3 py-1.5 transition-colors"
                  style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                  {active && (
                    <motion.span layoutId="reviewStarPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)', zIndex: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                  )}
                  <span className="relative" style={{ zIndex: 1 }}>{pill.label}</span>
                </button>
              )
            })}
          </div>
        </motion.div>

        {dataLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем отзывы...</div>
        ) : !data || data.reviews.length === 0 ? (
          loadError ? null : (
            <div className="nav-glass rounded-2xl p-8 text-center">
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                {stats && stats.total === 0 ? 'Отзывов пока нет. Нажмите «Обновить», чтобы проверить свежие отзывы на Kaspi.' : 'Нет отзывов с таким рейтингом.'}
              </div>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {data.reviews.map((r, i) => (
              <div key={`${r.trackedProductId}-${i}`} className="nav-glass rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{r.authorName || 'Покупатель Kaspi'}</div>
                    <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{r.productName}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: r.rating <= 3 ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}>
                      <StarIcon />{r.rating}
                    </span>
                    {r.date && <span className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{formatDate(r.date)}</span>}
                  </div>
                </div>
                {r.text && <div className="text-sm mt-1.5" style={{ color: 'var(--nav-text-secondary)' }}>{r.text}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
