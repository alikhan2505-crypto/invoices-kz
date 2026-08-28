'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import * as XLSX from 'xlsx'
import { formatDateTime, formatDate } from '@/lib/date'
import { addDaysToDateString, todayDateString } from '@/lib/dueDate'
import { useLanguage } from '@/components/LanguageProvider'
import { clearSearchLabel } from '@/lib/a11yLabels'
import { historyDict } from '@/lib/i18n/history'
import Skeleton from '@/components/Skeleton'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

// Flat solid-fill status badges -- same approved treatment as dashboard/page.tsx's
// statusFill (a solid color + white text, replacing the old soft-tint statusColor
// map this page used to have).
const statusFill: Record<string, string> = {
  paid: 'var(--nav-success)',
  sent: 'var(--nav-accent)',
  viewed: 'var(--nav-teal)',
  overdue: 'var(--nav-critical)',
  draft: 'var(--nav-text-muted)',
  cancelled: 'var(--nav-text-muted)',
}

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

// Below this, the search box doesn't filter -- a 1-2 char query against
// client/number/amount/note text matches almost everything and hides more
// than it helps. A hint under the input explains the threshold instead of
// the list just silently not narrowing.
const SEARCH_MIN_CHARS = 3

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function XIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function RepeatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2.1 21 6l-4 3.9" />
      <path d="M3 12.5a9 9 0 0 1 15-6.7l3-.1" />
      <path d="m7 22-4-3.9L7 14" />
      <path d="M21 11.5a9 9 0 0 1-15 6.7l-3 .1" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nav-text-muted)' }}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12h6M9 15.5h6M9 8.5h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// Animates an integer up from 0 to `value` -- copied from dashboard/page.tsx's
// CountUp. Unlike the dashboard (where each call site is keyed by a value that
// changes rarely, e.g. the period toggle), history's counts can change on every
// keystroke/filter click, so callers here key each instance by its own value
// (`key={s.value}`) -- that remounts a fresh CountUp (and replays the animation)
// only when the number actually changes, same mechanism the dashboard uses for
// its period-scoped stats.
function CountUp({ value, reduceMotion, format }: { value: number; reduceMotion: boolean; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(reduceMotion ? value : 0)

  useEffect(() => {
    if (reduceMotion) { setDisplay(value); return }
    let raf = 0
    const duration = 700
    const start = performance.now()
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(value * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{format ? format(display) : display.toLocaleString('ru-KZ')}</>
}

export default function History() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = historyDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('all_time')

  useEffect(() => { loadInvoices() }, [])

  async function loadInvoices() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase
      .from('invoices')
      .select('*, clients(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  async function deleteInvoice(e: React.MouseEvent, id: string, number: string) {
    e.stopPropagation()
    if (!confirm(t.confirmCancelInvoice(number))) return
    const { error } = await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', id)
    if (error) { alert(t.errorPrefix(error.message)); return }
    await supabase.from('invoice_logs').insert({ invoice_id: id, status: 'cancelled' })
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'cancelled' } : inv))
  }

  async function markOverdue() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const overdueDueDateTarget = addDaysToDateString(todayDateString(), -1)

    const { data: byDueDate, error: dueDateError } = await supabase
      .from('invoices')
      .update({ status: 'overdue' })
      .eq('user_id', user.id)
      .in('status', ['sent', 'viewed'])
      .lt('due_date', overdueDueDateTarget)
      .select()
    if (dueDateError) { alert(t.errorPrefix(dueDateError.message)); return }

    const { data: legacy, error: legacyError } = await supabase
      .from('invoices')
      .update({ status: 'overdue' })
      .eq('user_id', user.id)
      .in('status', ['sent', 'viewed'])
      .is('due_date', null)
      .lt('created_at', sevenDaysAgo.toISOString())
      .select()
    if (legacyError) { alert(t.errorPrefix(legacyError.message)); return }

    const total = (byDueDate?.length || 0) + (legacy?.length || 0)
    if (total > 0) {
      alert(t.markedOverdueMessage(total))
      loadInvoices()
    } else {
      alert(t.noOverdueInvoicesAlert)
    }
  }

  function exportToExcel() {
    const data = filtered.map(inv => ({
      [t.excelColumnNumber]: inv.number,
      [t.excelColumnClient]: inv.client_name || t.noClientLabel,
      [t.excelColumnBinIin]: inv.client_bin || '',
      [t.excelColumnAmount]: Number(inv.amount),
      [t.excelColumnStatus]: t.statusLabels[inv.status] || t.statusLabels.draft,
      [t.excelColumnNote]: inv.note || '',
      [t.excelColumnDate]: formatDate(inv.created_at),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t.excelSheetName)
    ws['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 15 },
      { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 15 },
    ]
    XLSX.writeFile(wb, t.excelFileName(formatDate(new Date().toISOString())))
  }

  const filtered = invoices.filter(inv => {
    const matchFilter = filter === 'all' || inv.status === filter
    const clientName = inv.client_name || inv.clients?.name || ''
    const matchSearch = search.trim().length < SEARCH_MIN_CHARS ||
      clientName.toLowerCase().includes(search.toLowerCase()) ||
      inv.number.toLowerCase().includes(search.toLowerCase()) ||
      String(inv.amount).includes(search) ||
      (inv.note || '').toLowerCase().includes(search.toLowerCase())

    const invDate = new Date(inv.created_at)
    const now = new Date()
    let matchDate = true
    if (dateFilter === 'all_time') {
      matchDate = true
    } else if (dateFilter === 'today') {
      matchDate = invDate.toDateString() === now.toDateString()
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now)
      weekAgo.setDate(now.getDate() - 7)
      matchDate = invDate >= weekAgo
    } else if (dateFilter === 'month') {
      matchDate = invDate.getMonth() === now.getMonth() &&
        invDate.getFullYear() === now.getFullYear()
    } else if (dateFilter === 'last_month') {
      let lastMonth = now.getMonth() - 1
      let lastMonthYear = now.getFullYear()
      if (lastMonth < 0) { lastMonth = 11; lastMonthYear -= 1 }
      matchDate = invDate.getMonth() === lastMonth &&
        invDate.getFullYear() === lastMonthYear
    }

    return matchFilter && matchSearch && matchDate
  })

  const counts = {
    all: filtered.length,
    paid: filtered.filter(i => i.status === 'paid').length,
    sent: filtered.filter(i => i.status === 'sent').length,
    overdue: filtered.filter(i => i.status === 'overdue').length,
  }

  const totalAmount = filtered
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.amount), 0)

  const statCards = [
    { key: 'all', label: t.statsAllLabel, value: counts.all, critical: false },
    { key: 'paid', label: t.statsPaidLabel, value: counts.paid, critical: false },
    { key: 'sent', label: t.statsUnpaidLabel, value: counts.sent, critical: false },
    { key: 'overdue', label: t.statsOverdueLabel, value: counts.overdue, critical: true },
  ]

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-5xl mx-auto p-4">
          {/* Header row */}
          <motion.div
            className="flex items-center justify-between flex-wrap gap-2 mb-5"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
          >
            <h2 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>История счетов</h2>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={markOverdue}
                className="nav-glass text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ color: 'var(--nav-critical)' }}
              >
                {t.markOverdueButtonLabel}
              </button>
              <button
                onClick={exportToExcel}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                {t.exportButtonLabel}
              </button>
            </div>
          </motion.div>

          {/* Search */}
          <motion.div
            className="nav-glass rounded-xl px-3 py-2.5 flex items-center gap-2 mb-3"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.05 }}
          >
            <span className="flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>
              <SearchIcon />
            </span>
            <input
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ color: 'var(--nav-text-primary)' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="flex-shrink-0 text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)] transition-colors"
                aria-label={clearSearchLabel(lang)}
              >
                <XIcon />
              </button>
            )}
          </motion.div>
          {search.trim().length > 0 && search.trim().length < SEARCH_MIN_CHARS && (
            <div className="text-xs mb-3 px-1" style={{ color: 'var(--nav-text-muted)' }}>
              {t.searchMinCharsHint(SEARCH_MIN_CHARS)}
            </div>
          )}

          {/* Date filter */}
          <motion.div
            className="flex gap-2 mb-3 overflow-x-auto pb-1"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.08 }}
          >
            {t.dateFilterOptions.map(d => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDateFilter(d.key)}
                className="relative overflow-hidden px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors duration-200"
                style={{
                  color: dateFilter === d.key ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
                  background: dateFilter === d.key ? 'transparent' : 'var(--nav-surface-glass)',
                }}
              >
                {dateFilter === d.key && (
                  <motion.span
                    layoutId="dateFilterPill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'var(--nav-accent)' }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{d.label}</span>
              </button>
            ))}
          </motion.div>

          {/* Status filter */}
          <motion.div
            className="flex gap-2 mb-4 overflow-x-auto pb-1"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.11 }}
          >
            {t.statusFilterOptions.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className="relative overflow-hidden px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors duration-200"
                style={{
                  color: filter === f.key ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
                  background: filter === f.key ? 'transparent' : 'var(--nav-surface-glass)',
                }}
              >
                {filter === f.key && (
                  <motion.span
                    layoutId="statusFilterPill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'var(--nav-accent)' }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{f.label}</span>
              </button>
            ))}
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {statCards.map((s, i) => (
              <motion.div
                key={s.key}
                className={`nav-glass rounded-xl p-3 text-center ${CARD_HOVER}`}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.14 + i * 0.04 }}
              >
                <div
                  className="text-lg font-bold tabular-nums"
                  style={{ color: s.critical && s.value > 0 ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}
                >
                  <CountUp key={s.value} value={s.value} reduceMotion={reduceMotion} />
                </div>
                <div className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--nav-text-muted)' }}>{s.label}</div>
              </motion.div>
            ))}
          </div>

          {totalAmount > 0 && (
            <motion.div
              className={`nav-glass nav-card-accent rounded-xl px-4 py-3 mb-4 flex items-center justify-between ${CARD_HOVER}`}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.28 }}
            >
              <span className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{t.incomeForPeriodLabel}</span>
              <span className="font-bold tabular-nums" style={{ color: 'var(--nav-accent)' }}>
                <CountUp key={totalAmount} value={totalAmount} reduceMotion={reduceMotion} format={n => `${n.toLocaleString('ru-KZ')} ₸`} />
              </span>
            </motion.div>
          )}

          {loading ? (
            <div className="rounded-2xl overflow-hidden mb-4 border border-[color:var(--nav-border-soft)] bg-[var(--nav-surface-chrome)] lg:border-0 lg:bg-transparent lg:rounded-none lg:overflow-visible lg:grid lg:grid-cols-2 lg:gap-3">
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className={`flex items-center p-4 lg:rounded-xl lg:border lg:border-[color:var(--nav-border-soft)] lg:bg-[var(--nav-surface-chrome)] ${i < 4 ? 'border-b border-b-[color:var(--nav-border-soft)] lg:border-b-0' : ''}`}
                >
                  <div className="flex-1">
                    <Skeleton className="h-3 w-16 mb-2" />
                    <Skeleton className="h-4 w-32 mb-1.5" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="text-right">
                    <Skeleton className="h-4 w-16 mb-1.5 ml-auto" />
                    <Skeleton className="h-5 w-14 rounded-full ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12">
              <DocumentIcon />
              <p className="text-sm mt-3 mb-4" style={{ color: 'var(--nav-text-secondary)' }}>{t.noInvoicesLabel}</p>
              <button
                onClick={() => router.push('/create')}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                {t.createFirstInvoiceButton}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden mb-4 border border-[color:var(--nav-border-soft)] bg-[var(--nav-surface-chrome)] lg:border-0 lg:bg-transparent lg:rounded-none lg:overflow-visible lg:grid lg:grid-cols-2 lg:gap-3">
              {filtered.map((inv, i) => (
                <motion.div key={inv.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : Math.min(i * 0.035, 0.4), duration: reduceMotion ? 0 : 0.35, ease: EASE }}
                  className={`flex items-center p-4 transition-all duration-150 hover:translate-x-1 hover:bg-[var(--nav-surface-glass)] lg:hover:translate-x-0 lg:hover:-translate-y-1 lg:hover:shadow-[var(--nav-card-glow)] lg:rounded-xl lg:border lg:border-[color:var(--nav-border-soft)] lg:bg-[var(--nav-surface-chrome)] ${i < filtered.length - 1 ? 'border-b border-b-[color:var(--nav-border-soft)] lg:border-b-0' : ''}`}
                >
                  <div className="flex-1 flex items-start justify-between cursor-pointer min-w-0"
                    onClick={() => router.push('/invoice/' + inv.id)}>
                    <div className="min-w-0">
                      <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{inv.number}</div>
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--nav-text-primary)' }}>
                        {inv.client_name || inv.clients?.name || t.noClientLabel}
                      </div>
                      {inv.note && (
                        <div className="text-xs mt-0.5 italic truncate max-w-[180px]" style={{ color: 'var(--nav-text-muted)' }}>
                          {inv.note}
                        </div>
                      )}
                      <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                        {formatDateTime(inv.created_at)}
                      </div>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <div className="text-sm font-medium tabular-nums mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
                        {Number(inv.amount).toLocaleString('ru-KZ')} ₸
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded-full font-semibold text-white"
                        style={{ background: statusFill[inv.status] || statusFill.draft }}
                      >
                        {t.statusLabels[inv.status] || t.statusLabels.draft}
                      </span>
                    </div>
                  </div>
                  {/* 44x44 hit area (PRODUCT.md tap-zone baseline) around the
                      small icon; ml-1 instead of ml-4 keeps the previous
                      visual gap since the icon now floats centered in 44px. */}
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push('/create?repeat=' + inv.id) }}
                    className="w-11 h-11 ml-1 flex items-center justify-center rounded-lg flex-shrink-0 text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-accent)] hover:bg-[var(--nav-surface-glass)] transition-colors"
                    aria-label={t.repeatInvoiceLabel}
                    title={t.repeatInvoiceLabel}
                  >
                    <RepeatIcon />
                  </button>
                  <button
                    onClick={(e) => deleteInvoice(e, inv.id, inv.number)}
                    className="w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0 text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-critical)] hover:bg-[var(--nav-surface-glass)] transition-colors"
                    aria-label={t.confirmCancelInvoice(inv.number)}
                  >
                    <XIcon size={15} />
                  </button>
                </motion.div>
              ))}
            </div>
          )}

          <motion.button
            onClick={() => router.push('/create')}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.34 }}
            className="w-full flex items-center justify-center px-4 py-3.5 rounded-xl text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
          >
            {t.createNewInvoiceButton}
          </motion.button>
        </div>
      </main>
    </DesktopShell>
  )
}
