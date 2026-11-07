'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'
import { baseProductName } from '@/lib/kaspiShop/salesAnalytics'
import { usePageDocumentTitle } from '@/lib/usePageDocumentTitle'
import PageHeader, { PageHeaderButton } from '@/components/PageHeader'
import PageContainer from '@/components/PageContainer'
import KaspiAccessRetry from '@/components/kaspiShop/KaspiAccessRetry'
import { checkKaspiConnection } from '@/lib/kaspiShop/connectionGuard'

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

// Числа самих карточек Kaspi (total_count и avg_rating, средняя взвешена по числу
// отзывов): не то же самое, что загруженная выборка в stats (аудит K40).
type ReviewCatalog = {
  totalCount: number | null
  avgRating: number | null
  productsWithTotals: number
  productsCount: number
}

type ReviewsResponse = {
  stats: ReviewStats
  catalog?: ReviewCatalog
  reviews: Review[]
  lastFetchedAt: string | null
  productErrorCount: number
  // Только когда запрос шёл с since: сколько товаров ждём и сколько уже обновил ЭТОТ запуск.
  refresh?: { expected: number; updated: number } | null
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

function monthKey(iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'unknown'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  if (key === 'unknown') return 'Без даты'
  const [year, month] = key.split('-').map(Number)
  const label = new Date(year, month - 1, 1).toLocaleDateString('ru-KZ', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
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
  // Заголовок вкладки и на время загрузки (PageHeader ещё не отрисован); строка та же, что ставит PageHeader.
  usePageDocumentTitle('Отзывы')
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ReviewsResponse | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [accessError, setAccessError] = useState('')
  // Номер последнего запроса отзывов: ответ на устаревший (другой фильтр звёзд) не затирает новый.
  const reviewsReqId = useRef(0)
  const [activeStars, setActiveStars] = useState<number | null>(null)
  const [refreshNote, setRefreshNote] = useState('')
  const [groupMode, setGroupMode] = useState<'none' | 'product' | 'month'>('none')

  // Страницу закрыли или ушли с неё: опрос обновления дальше не крутим.
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading) loadReviews(activeStars) }, [activeStars, loading])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
    if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/upgrade'); return }
    // Демпинг is the only page with the actual connect terminal (phone/OTP)
    // -- every other page redirects there instead of rendering its own broken
    // state when there's no active connection (2026-09-03 founder: check for a
    // connected store before opening any page or sub-page).
    const { data: { session } } = await supabase.auth.getSession()
    // Сбой запроса не равен «не подключён»: показываем «Повторить», а не уводим
    // подключённого продавца на окно подключения (аудит Kaspi 2026-11-06, K12).
    const access = await checkKaspiConnection(session?.access_token)
    if (access.kind === 'error') { setAccessError(access.message); return }
    if (access.kind === 'redirect') { router.push('/kaspi-shop'); return }
    setLoading(false)
  }

  async function loadReviews(stars: number | null) {
    const id = ++reviewsReqId.current
    setDataLoading(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const qs = stars !== null ? `?stars=${stars}` : ''
      const res = await fetch(`/api/kaspi-shop/reviews${qs}`, { headers })
      const json = await res.json()
      if (id !== reviewsReqId.current) return
      if (!res.ok) { setLoadError(json.error || 'Не удалось загрузить отзывы'); setData(null); return }
      setData(json)
    } catch {
      if (id !== reviewsReqId.current) return
      setLoadError('Не удалось загрузить отзывы. Проверьте соединение и попробуйте ещё раз.')
      setData(null)
    } finally {
      if (id === reviewsReqId.current) setDataLoading(false)
    }
  }

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

  // Опрос прогресса ИМЕННО этого запуска: since -- серверное время запуска (его отдаёт
  // POST), прогресс -- число товаров, у которых fetched_at не раньше since. Раньше
  // ждали, пока «самая свежая строка по всем товарам» станет новее часов браузера, и
  // обновление объявлялось законченным по первому же пришедшему товару (аудит K42).
  async function pollRefresh(since: string, expectedHint: number): Promise<boolean> {
    // ~3 с на шаг; бюджет растёт с числом товаров (раннер тратит около секунды на товар).
    const maxAttempts = Math.min(120, Math.ceil(expectedHint * 2 / 3) + 15)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(3000)
      if (!mounted.current) return false
      const pollHeaders = await authHeader()
      const qs = `?since=${encodeURIComponent(since)}${activeStars !== null ? `&stars=${activeStars}` : ''}`
      const pollRes = await fetch(`/api/kaspi-shop/reviews${qs}`, { headers: pollHeaders }).catch(() => null)
      const pollJson = pollRes ? await pollRes.json().catch(() => null) : null
      if (pollRes?.ok && pollJson) {
        setData(pollJson)
        const r = pollJson.refresh as ReviewsResponse['refresh']
        if (r && r.expected > 0) {
          if (r.updated >= r.expected) { setRefreshNote(''); return true }
          setRefreshNote(`Обновлено ${r.updated} из ${r.expected} товаров. Раннер проверяет их по очереди, это может занять несколько минут...`)
        }
      }
    }
    return false
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
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/reviews', { method: 'POST', headers })
      const json = await res.json().catch(() => ({}))
      let since: string | null = null
      if (res.status === 429 && json.alreadyRunning && json.since) {
        // Обновление уже идёт (запущено раньше, может быть с другой вкладки): второй
        // запуск не создаём, а просто следим за этим.
        setRefreshNote('Обновление отзывов уже идёт. Показываем, как оно продвигается.')
        since = json.since
      } else if (res.status === 429) {
        // Лимит: слишком рано для нового запуска, а прошлый уже закончился.
        setRefreshNote(json.error || 'Новый запуск пока недоступен.')
        await loadReviews(activeStars)
        return
      } else if (!res.ok) {
        setLoadError(json.error || 'Не удалось обновить отзывы')
        return
      } else {
        since = json.since || null
        setRefreshNote(`Проверяем ${json.dispatchedCount} товар(ов) на Kaspi. Это может занять пару минут...`)
      }
      if (!since) {
        setRefreshNote('Обновление запущено. Откройте страницу заново через пару минут, чтобы увидеть свежие данные.')
        return
      }

      const finished = await pollRefresh(since, Number(json.dispatchedCount) || 0)
      if (!finished && mounted.current) {
        setRefreshNote('Обновление ещё идёт на стороне Kaspi. Данные подтянутся сами, откройте страницу заново через минуту-две.')
      }
    } catch {
      setLoadError('Не удалось обновить отзывы. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      if (mounted.current) setRefreshing(false)
    }
  }

  if (loading) {
    return accessError
      ? <KaspiAccessRetry message={accessError} onRetry={() => { setAccessError(''); checkAccess() }} />
      : <LoadingSpinner />
  }

  const stats = data?.stats

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />

      <PageContainer variant="full" className="flex-1 min-w-0 pb-6">
        <PageHeader
          title="Отзывы"
          subtitle="Отзывы покупателей"
          right={(
            <div className="flex flex-col items-end gap-1.5">
              <PageHeaderButton onClick={doRefresh} disabled={refreshing} className="disabled:opacity-50">
                {refreshing ? 'Обновляем...' : 'Обновить'}
              </PageHeaderButton>
              {data?.lastFetchedAt && (
                <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>Обновлено: {formatDateTime(data.lastFetchedAt)}</div>
              )}
            </div>
          )}
        />
        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => loadReviews(activeStars)} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="min-w-0">
              <div className="text-lg font-bold font-mono tabular-nums flex items-center gap-1" style={{ color: 'var(--nav-text-primary)' }}>
                {data?.catalog?.avgRating != null ? <><StarIcon />{data.catalog.avgRating.toFixed(1)}</> : '—'}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>средняя оценка по карточкам товаров</div>
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                {data?.catalog?.totalCount != null ? data.catalog.totalCount.toLocaleString('ru-KZ') : '—'}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                отзывов на карточках{stats ? ` · загружено ${stats.total.toLocaleString('ru-KZ')}` : ''}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: (stats?.negative ?? 0) > 0 ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}>{stats?.negative ?? 0}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>негативных (≤3★) среди загруженных</div>
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{stats?.fiveStar ?? 0}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>5★ среди загруженных</div>
            </div>
          </div>
          <div className="text-[11px] mt-4 max-w-3xl" style={{ color: 'var(--nav-text-muted)' }}>
            Оценка и число отзывов взяты с карточек товаров Kaspi: эти отзывы общие для всех продавцов карточки, а не рейтинг вашего магазина (он на странице «Качество»). В список загружается до 50 самых популярных отзывов на товар: Kaspi не отдаёт свежие первыми, поэтому новый негативный отзыв может в список не попасть.
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

          <div className="flex items-center gap-2 flex-wrap mt-6">
            <div className="flex items-center gap-1 flex-wrap nav-glass rounded-full p-1 w-fit">
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
            <div className="flex items-center gap-1 flex-wrap nav-glass rounded-full p-1 w-fit">
              {([['none', 'Список'], ['product', 'По товарам'], ['month', 'По месяцам']] as const).map(([value, label]) => {
                const active = groupMode === value
                return (
                  <button key={value} onClick={() => setGroupMode(value)}
                    className="relative text-xs font-medium rounded-full px-3 py-1.5 transition-colors"
                    style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                    {active && (
                      <motion.span layoutId="reviewGroupPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)', zIndex: 0 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                    )}
                    <span className="relative" style={{ zIndex: 1 }}>{label}</span>
                  </button>
                )
              })}
            </div>
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
        ) : (() => {
          // Full card (with review text) for the flat list -- the product
          // name earns its place there since nothing else on screen says
          // which product a review is about. Grouped views already say that
          // once in the group header, so each row compacts down to exactly
          // the 3 fields that vary per review (founder 2026-09-03: "имя
          // покупателя, дата оценки и оценка").
          function renderReviewCard(r: Review, i: number) {
            return (
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
            )
          }

          function renderReviewRow(r: Review, i: number) {
            return (
              <div key={`${r.trackedProductId}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 nav-glass rounded-xl">
                <span className="text-sm truncate" style={{ color: 'var(--nav-text-primary)' }}>{r.authorName || 'Покупатель Kaspi'}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r.date && <span className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{formatDate(r.date)}</span>}
                  <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: r.rating <= 3 ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}>
                    <StarIcon />{r.rating}
                  </span>
                </div>
              </div>
            )
          }

          if (groupMode === 'none') {
            return <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3 items-start">{data.reviews.map((r, i) => renderReviewCard(r, i))}</div>
          }

          const groups = new Map<string, Review[]>()
          const keyOf = groupMode === 'product'
            ? (r: Review) => baseProductName(r.productName) || r.productName
            : (r: Review) => monthKey(r.date)
          for (const r of data.reviews) {
            const key = keyOf(r)
            const list = groups.get(key) || []
            list.push(r)
            groups.set(key, list)
          }
          const sortedEntries = groupMode === 'product'
            ? Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)
            : Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]))

          return (
            <div className="space-y-5">
              {sortedEntries.map(([key, groupReviews]) => (
                <div key={key}>
                  <div className="text-xs font-semibold mb-2 px-1 truncate" style={{ color: 'var(--nav-text-secondary)' }}>
                    {groupMode === 'product' ? key : monthLabel(key)} <span style={{ color: 'var(--nav-text-muted)', fontWeight: 400 }}>· {groupReviews.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2 2xl:grid-cols-3">{groupReviews.map((r, i) => renderReviewRow(r, i))}</div>
                </div>
              ))}
            </div>
          )
        })()}
      </PageContainer>
    </main>
    </DesktopShell>
  )
}
