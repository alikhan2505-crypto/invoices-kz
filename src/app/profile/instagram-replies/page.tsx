'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import { backLabel } from '@/lib/a11yLabels'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'
// Same rounded-bordered field treatment used by src/app/create/page.tsx.
const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
function WarnDotIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="var(--nav-critical)" style={{ flexShrink: 0 }}>
      <circle cx="4" cy="4" r="4" />
    </svg>
  )
}

type Template = { id: string; trigger_words: string[]; reply_text: string; channel: 'dm' | 'comment' | null }
type LogEntry = {
  id: string
  source: string
  from_username: string | null
  incoming_text: string
  reply_text: string | null
  reply_type: string
  status: string
  is_urgent: boolean
  created_at: string
}
type Analytics = {
  totalHandled: number
  templateMatchCount: number
  aiDraftCount: number
  aiSentCount: number
  aiSkippedCount: number
  urgentCount: number
  templateUsage: { id: string; triggerWords: string[]; channel: 'dm' | 'comment' | null; count: number }[]
}

export default function InstagramReplies() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [paused, setPaused] = useState(false)
  const [newWords, setNewWords] = useState('')
  const [newReply, setNewReply] = useState('')
  const [newChannel, setNewChannel] = useState<'both' | 'dm' | 'comment'>('both')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }

    const headers = await authHeader()
    const [templatesRes, settingsRes, logRes, analyticsRes] = await Promise.all([
      fetch('/api/instagram/replies/templates', { headers }),
      fetch('/api/instagram/replies/settings', { headers }),
      fetch('/api/instagram/replies/log', { headers }),
      fetch('/api/instagram/replies/analytics', { headers }),
    ])
    const templatesData = await templatesRes.json()
    const settingsData = await settingsRes.json()
    const logData = await logRes.json()
    setTemplates(templatesData.templates || [])
    setPaused(settingsData.paused || false)
    setLog(logData.log || [])
    if (analyticsRes.ok) setAnalytics(await analyticsRes.json())
    setLoading(false)
  }

  async function togglePause() {
    const next = !paused
    setPaused(next)
    const headers = await authHeader()
    await fetch('/api/instagram/replies/settings', { method: 'POST', headers, body: JSON.stringify({ paused: next }) })
  }

  async function addTemplate() {
    const words = newWords.split(',').map(w => w.trim()).filter(Boolean)
    if (words.length === 0 || !newReply) return
    setSaving(true)
    const headers = await authHeader()
    await fetch('/api/instagram/replies/templates', {
      method: 'POST', headers,
      body: JSON.stringify({ trigger_words: words, reply_text: newReply, channel: newChannel === 'both' ? null : newChannel }),
    })
    setNewWords('')
    setNewReply('')
    setNewChannel('both')
    setSaving(false)
    load()
  }

  async function deleteTemplate(id: string) {
    const headers = await authHeader()
    await fetch('/api/instagram/replies/templates', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
    load()
  }

  if (loading) return <LoadingSpinner />

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-6xl mx-auto p-4 lg:p-8 space-y-4">

        <motion.div {...fadeIn(0)} className="nav-glass rounded-2xl px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn transition-colors flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }} aria-label={backLabel('ru')}>
            <ChevronLeftIcon />
          </button>
          <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Автоответы Instagram</span>
        </motion.div>

        <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:items-start">
          <motion.div {...fadeIn(1)} className={`nav-glass rounded-2xl p-4 flex items-center justify-between ${CARD_HOVER}`}>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>Пауза автоответов</div>
              <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>Останавливает и шаблоны, и AI-черновики</div>
            </div>
            <button onClick={togglePause}
              className="w-12 h-6 rounded-full transition-colors relative flex-shrink-0"
              style={{ background: paused ? 'var(--nav-critical)' : 'var(--nav-border)' }}>
              <span className="absolute top-1 w-4 h-4 rounded-full shadow transition-all"
                style={{ background: 'var(--nav-surface-chrome)', left: paused ? '1.75rem' : '0.25rem' }}></span>
            </button>
          </motion.div>

          {analytics && analytics.totalHandled > 0 && (
            <motion.div {...fadeIn(2)} className={`nav-glass rounded-2xl p-4 lg:col-span-2 ${CARD_HOVER}`}>
              <div className="text-sm font-medium mb-3" style={{ color: 'var(--nav-text-primary)' }}>Аналитика</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                {[
                  { value: analytics.templateMatchCount, label: 'Через шаблоны' },
                  { value: analytics.aiDraftCount, label: 'Ушло в AI' },
                  { value: analytics.aiSentCount, label: 'AI отправлено' },
                  { value: analytics.aiSkippedCount, label: 'AI пропущено' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-2 text-center" style={{ background: 'var(--nav-bg)' }}>
                    <div className="text-lg font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{s.value}</div>
                    <div className="text-[10px]" style={{ color: 'var(--nav-text-muted)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {analytics.urgentCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>
                  <WarnDotIcon /> Срочных обращений: {analytics.urgentCount}
                </div>
              )}
              {analytics.templateUsage.some(t => t.count > 0) && (
                <>
                  <div className="text-xs mb-1 mt-2" style={{ color: 'var(--nav-text-secondary)' }}>Топ шаблонов по использованию:</div>
                  <div className="space-y-1 lg:columns-2 lg:gap-x-6 lg:space-y-0">
                    {analytics.templateUsage.filter(t => t.count > 0).slice(0, 5).map(t => (
                      <div key={t.id} className="flex items-center justify-between text-xs lg:break-inside-avoid lg:mb-1">
                        <span className="truncate mr-2" style={{ color: 'var(--nav-text-secondary)' }}>{t.triggerWords.join(', ')}</span>
                        <span className="flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>{t.count}×</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </div>

        <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
          <motion.div {...fadeIn(3)} className="nav-glass rounded-2xl p-4">
            <div className="text-sm font-medium mb-3" style={{ color: 'var(--nav-text-primary)' }}>Шаблоны</div>
            <div className="space-y-2 mb-3">
              {templates.map(t => (
                <div key={t.id} className="rounded-xl p-3" style={{ border: '1px solid var(--nav-border-soft)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.trigger_words.join(', ')}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>
                      {t.channel === 'dm' ? 'Только DM' : t.channel === 'comment' ? 'Только комментарии' : 'DM + комментарии'}
                    </span>
                  </div>
                  <div className="text-sm mb-2" style={{ color: 'var(--nav-text-secondary)' }}>{t.reply_text}</div>
                  <button onClick={() => deleteTemplate(t.id)} className="text-xs transition-colors" style={{ color: 'var(--nav-critical)' }}>Удалить</button>
                </div>
              ))}
            </div>
            <input className={`${INPUT_CLS} mb-2`} placeholder="Триггер-слова через запятую"
              value={newWords} onChange={e => setNewWords(e.target.value)} />
            <textarea className={`${INPUT_CLS} mb-2 resize-none`} placeholder="Текст ответа" rows={2}
              value={newReply} onChange={e => setNewReply(e.target.value)} />
            <div className="flex gap-2 mb-2">
              {([['both', 'DM + комментарии'], ['dm', 'Только DM'], ['comment', 'Только комментарии']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setNewChannel(val)}
                  className="flex-1 text-xs rounded-lg py-2 border transition-colors"
                  style={newChannel === val
                    ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', borderColor: 'var(--nav-accent)' }
                    : { color: 'var(--nav-text-secondary)', borderColor: 'var(--nav-border)' }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={addTemplate} disabled={saving}
              className="w-full rounded-xl py-2.5 text-sm font-medium transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {saving ? 'Сохраняем...' : 'Добавить шаблон'}
            </button>
          </motion.div>

          <motion.div {...fadeIn(4)} className="nav-glass rounded-2xl p-4">
            <div className="text-sm font-medium mb-3" style={{ color: 'var(--nav-text-primary)' }}>Журнал (последние 50)</div>
            <div className="space-y-2 lg:max-h-[600px] lg:overflow-y-auto">
              {log.map(entry => (
                <div key={entry.id} className="rounded-xl p-3 text-xs"
                  style={entry.is_urgent ? { border: '1.5px solid var(--nav-critical)' } : { border: '1px solid var(--nav-border-soft)' }}>
                  <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--nav-text-muted)' }}>
                    {entry.is_urgent && <WarnDotIcon />}
                    {entry.from_username} · {entry.source} · {entry.status}
                  </div>
                  <div className="mb-1" style={{ color: 'var(--nav-text-secondary)' }}>→ {entry.incoming_text}</div>
                  {entry.reply_text && <div style={{ color: 'var(--nav-text-muted)' }}>← {entry.reply_text}</div>}
                </div>
              ))}
              {log.length === 0 && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>Пока пусто</div>}
            </div>
          </motion.div>
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}
