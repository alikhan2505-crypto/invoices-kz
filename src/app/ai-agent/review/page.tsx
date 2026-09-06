'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'

const EASE = [0.16, 1, 0.3, 1] as const
const FREE_REGENS = 3

interface ReviewItem {
  id: string
  agentId: string
  agentName: string
  customerHandle: string
  channel: string
  question: string
  text: string
  urgent: boolean
  regenCount: number
  createdAt: string
}

// Phase 3 «счёт из чата»: a pending invoice draft awaiting the owner's
// approve/reject (or showing a send error with retry).
interface InvoiceDraft {
  id: string
  customer_name: string
  customer_phone: string
  items: { name: string; qty: number; unitPrice: number }[]
  total: number
  source: 'ai_tool' | 'flow_step'
  status: 'pending_approval' | 'error' | 'sending'
  error_message: string | null
  customerHandle: string
  channel: string
}

function AlertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function TelegramIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 3l1.9 5.7a2 2 0 0 0 1.4 1.4L21 12l-5.7 1.9a2 2 0 0 0-1.4 1.4L12 21l-1.9-5.7a2 2 0 0 0-1.4-1.4L3 12l5.7-1.9a2 2 0 0 0 1.4-1.4L12 3z" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  )
}

const CHANNEL_META: Record<string, { label: string; icon: () => React.ReactElement }> = {
  instagram: { label: 'Instagram', icon: InstagramIcon },
  telegram: { label: 'Telegram', icon: TelegramIcon },
  whatsapp: { label: 'WhatsApp', icon: WhatsAppIcon },
}

export default function AiAgentReview() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [fetching, setFetching] = useState(false)
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([])
  const [draftActing, setDraftActing] = useState<string | null>(null)
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({})
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [acting, setActing] = useState<string | null>(null)
  const [regening, setRegening] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [forbidden, setForbidden] = useState(false)
  // Which card's regen-price hint popover is open (id) -- same
  // outside-click-to-close pattern as /create's showVatHint, generalized to
  // one-popover-per-card via a ref map.
  const [hintFor, setHintFor] = useState<string | null>(null)
  const hintRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function loadItems(agent: string) {
    setFetching(true)
    const headers = await authHeader()
    const params = new URLSearchParams()
    if (agent !== 'all') params.set('agentId', agent)
    const qs = params.toString()
    const res = await fetch(`/api/ai-agent/review${qs ? `?${qs}` : ''}`, { headers })
    if (res.ok) {
      const data = await res.json()
      setItems(data.items || [])
    }
    setFetching(false)
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    // AI-агент is open to admins (testing) and active Pro-plan users
    // (2026-09-02, opened up now that Telegram/WhatsApp/website/API are
    // proven live -- Instagram stays disabled below pending Meta review).
    // The real enforcement is server-side (the API routes below 403
    // admin_only for anyone that fails this same check); this just swaps
    // their redirect-to-/dashboard for an inline message, since a redirect
    // can misfire on a legitimate session that hasn't finished loading yet.
    const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
    if (!profile?.is_admin && !getActivePlan(profile).canAiAgent) { setForbidden(true); setLoading(false); return }
    const headers = await authHeader()
    // loadItems folded into the same Promise.all as the other two initial
    // fetches (final-review finding) -- it doesn't need to wait for the
    // agents/drafts responses to be handled first, so serializing it after
    // them was a needless extra round-trip on first paint.
    const [agentsRes, draftsRes] = await Promise.all([
      fetch('/api/ai-agent/agents', { headers }),
      fetch('/api/ai-agent/invoice-drafts', { headers }),
      loadItems('all'),
    ])
    if (agentsRes.ok) {
      const data = await agentsRes.json()
      setAgents(Array.isArray(data.agents) ? data.agents.map((a: any) => ({ id: a.id, name: a.name })) : [])
    }
    if (draftsRes.ok) {
      const data = await draftsRes.json()
      setDrafts(data.drafts || [])
    }
    setLoading(false)
  }

  function changeAgent(id: string) {
    setAgentFilter(id)
    loadItems(id)
  }

  async function draftAct(id: string, action: 'approve' | 'reject') {
    setDraftActing(id)
    setDraftErrors(prev => { const next = { ...prev }; delete next[id]; return next })
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/invoice-drafts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ draftId: id, action }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDraftErrors(prev => ({ ...prev, [id]: data.error || 'Не удалось выполнить действие. Попробуйте ещё раз.' }))
        return
      }
      if (action === 'approve') showToast('Счёт создан и отправлен клиенту в чат')
      setDrafts(prev => prev.filter(d => d.id !== id))
    } catch {
      setDraftErrors(prev => ({ ...prev, [id]: 'Ошибка сети. Проверьте соединение и попробуйте ещё раз.' }))
    } finally {
      setDraftActing(null)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!hintFor) return
    function onOutsideClick(e: MouseEvent) {
      const el = hintFor ? hintRefs.current[hintFor] : null
      if (el && !el.contains(e.target as Node)) setHintFor(null)
    }
    document.addEventListener('click', onOutsideClick)
    return () => document.removeEventListener('click', onOutsideClick)
  }, [hintFor])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  function showToast(text: string) {
    setToast(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  function setError(id: string, text: string) {
    setErrors(prev => ({ ...prev, [id]: text }))
  }

  function clearError(id: string) {
    setErrors(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function act(id: string, action: 'send' | 'skip') {
    setActing(id)
    clearError(id)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/review', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messageId: id, action, editedText: edits[id] }),
      })
      if (!res.ok) {
        setError(id, 'Не удалось выполнить действие. Попробуйте ещё раз.')
        return
      }
      const data = await res.json()
      // The approve handler just saved this reply as a reusable template --
      // show the real trigger words it extracted (only when a template was
      // actually created; a failed extraction shows nothing).
      if (action === 'send' && Array.isArray(data.triggerWords) && data.triggerWords.length > 0) {
        showToast(`Шаблон сохранён. Триггеры: ${data.triggerWords.join(', ')}`)
      }
      setItems(prev => prev.filter(i => i.id !== id))
    } catch {
      setError(id, 'Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setActing(null)
    }
  }

  async function regenerate(id: string) {
    setRegening(id)
    clearError(id)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/review/regenerate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messageId: id }),
      })
      if (!res.ok) {
        if (res.status === 402) {
          setError(id, 'Недостаточно баланса кошелька для платной перегенерации. Пополните баланс на странице Kaspi Cashier API.')
        } else {
          setError(id, 'Не удалось сгенерировать вариант. Попробуйте ещё раз.')
        }
        return
      }
      const data = await res.json()
      setItems(prev => prev.map(i => i.id === id
        ? { ...i, text: data.replyText, urgent: !!data.urgent, regenCount: i.regenCount + 1 }
        : i))
      // Drop any manual edit -- the point of «Другой вариант» is a fresh draft.
      setEdits(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } catch {
      setError(id, 'Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setRegening(null)
    }
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (forbidden) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Эта функция пока доступна только администраторам.</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-7xl mx-auto p-4 lg:p-6 pb-6">
        <motion.div
          className="flex items-start justify-between gap-3 mb-6 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <div className="flex items-center gap-2.5 mb-1 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Диалоги на проверке</h1>
              {(agentFilter === 'all' ? items.length + drafts.length : items.length) > 0 && (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  На проверке: {agentFilter === 'all' ? items.length + drafts.length : items.length}
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Черновики ответов ждут вашего одобрения</p>
          </div>
          {agents.length > 0 && (
            <select
              value={agentFilter}
              onChange={e => changeAgent(e.target.value)}
              aria-label="Выбор агента"
              className="nav-glass rounded-lg px-3 py-2 text-sm font-medium outline-none cursor-pointer flex-shrink-0"
              style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
            >
              <option value="all">Все агенты</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </motion.div>

        {(agentFilter === 'all' ? items.length === 0 && drafts.length === 0 : items.length === 0) && (
          <div className="text-sm text-center py-8" style={{ color: 'var(--nav-text-muted)' }}>Пока нечего проверять</div>
        )}

        {agentFilter === 'all' && drafts.length > 0 && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nav-text-muted)' }}>Черновики счетов</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {drafts.map((d, i) => {
                const channel = CHANNEL_META[d.channel] || CHANNEL_META.instagram
                const ChannelIcon = channel.icon
                return (
                  <motion.div
                    key={d.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.05, 0.3) }}
                    className="nav-glass nav-card-accent rounded-2xl p-4 flex flex-col"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 nav-glass rounded-full px-2 py-1 text-[10.5px] font-bold" style={{ color: 'var(--nav-text-secondary)' }}>
                        <ChannelIcon /> {channel.label}
                      </span>
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-[10.5px] font-bold nav-glass" style={{ color: 'var(--nav-accent)' }}>
                        {d.source === 'flow_step' ? 'Сценарий' : 'ИИ'}
                      </span>
                    </div>
                    <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--nav-text-primary)' }}>{d.customer_name || d.customerHandle}</div>
                    {d.customer_phone && (
                      <div className="text-xs mb-2" style={{ color: 'var(--nav-text-muted)' }}>{d.customer_phone}</div>
                    )}
                    <div className="rounded-lg px-3 py-2 mb-2" style={{ background: 'var(--nav-bg)' }}>
                      {d.items.map((it, j) => (
                        <div key={j} className="flex items-baseline justify-between gap-2 text-xs py-0.5" style={{ color: 'var(--nav-text-secondary)' }}>
                          <span className="truncate">{it.name} × {it.qty}</span>
                          <span className="font-mono tabular-nums flex-shrink-0">{(it.qty * it.unitPrice).toLocaleString('ru-KZ')} ₸</span>
                        </div>
                      ))}
                      <div className="flex items-baseline justify-between gap-2 text-sm font-bold pt-1.5 mt-1" style={{ color: 'var(--nav-text-primary)', borderTop: '1px solid var(--nav-border-soft)' }}>
                        <span>Итого</span>
                        <span className="font-mono tabular-nums">{Number(d.total).toLocaleString('ru-KZ')} ₸</span>
                      </div>
                    </div>
                    {d.status === 'error' && d.error_message && (
                      <div className="text-xs mb-2 flex items-start gap-1.5" style={{ color: 'var(--nav-critical)' }}>
                        <AlertIcon /> Ошибка отправки: {d.error_message}
                      </div>
                    )}
                    {draftErrors[d.id] && <div className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{draftErrors[d.id]}</div>}
                    <div className="flex gap-2 mt-auto">
                      <button onClick={() => draftAct(d.id, 'approve')} disabled={draftActing === d.id || d.status === 'sending'}
                        className="flex-1 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        {d.status === 'sending' ? 'Отправляется…' : d.status === 'error' ? 'Повторить' : 'Отправить'}
                      </button>
                      <button onClick={() => draftAct(d.id, 'reject')} disabled={draftActing === d.id || d.status === 'sending'}
                        className="flex-1 nav-glass rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-secondary)' }}>
                        Отклонить
                      </button>
                    </div>
                    {/* Ручная правка: /create предзаполнится из черновика; сам
                        черновик после ручного выставления отклоните здесь. */}
                    <a href={`/create?agentDraft=${d.id}`} className="text-[11px] mt-2 text-center underline underline-offset-2" style={{ color: 'var(--nav-text-muted)' }}>
                      Открыть в конструкторе счёта ↗
                    </a>
                  </motion.div>
                )
              })}
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" style={{ opacity: fetching ? 0.6 : 1 }}>
          {items.map((item, i) => {
            const channel = CHANNEL_META[item.channel] || CHANNEL_META.instagram
            const ChannelIcon = channel.icon
            const freeLeft = Math.max(0, FREE_REGENS - item.regenCount)
            return (
            <motion.div
              key={item.id}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.05, 0.3) }}
              className="nav-glass nav-card-accent rounded-2xl p-4 flex flex-col"
            >
              {item.urgent && (
                <div className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: 'var(--nav-critical)' }}>
                  <AlertIcon /> Похоже на срочное/негатив
                </div>
              )}
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 nav-glass rounded-full px-2 py-1 text-[10.5px] font-bold" style={{ color: 'var(--nav-text-secondary)' }}>
                  <ChannelIcon /> {channel.label}
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--nav-text-muted)' }}>{item.customerHandle}</span>
              </div>
              {agentFilter === 'all' && agents.length > 1 && (
                <div className="text-[11px] font-medium mb-2 truncate" style={{ color: 'var(--nav-text-muted)' }}>{item.agentName}</div>
              )}
              {item.question && (
                <div className="rounded-lg px-3 py-2 mb-3" style={{ background: 'var(--nav-bg)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--nav-text-muted)' }}>Вопрос клиента</div>
                  <div className="text-sm max-h-24 overflow-y-auto" style={{ color: 'var(--nav-text-secondary)' }}>{item.question}</div>
                </div>
              )}
              <textarea
                className="w-full rounded-lg px-3 py-2 text-sm mb-2 min-h-[80px] outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                value={edits[item.id] ?? item.text}
                onChange={e => setEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
              />
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => regenerate(item.id)}
                  disabled={regening === item.id || acting === item.id}
                  className="flex-1 nav-glass rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  style={{ color: 'var(--nav-accent)' }}
                >
                  <SparklesIcon /> {regening === item.id ? 'Генерация…' : 'Другой вариант'}
                </button>
                <span ref={el => { hintRefs.current[item.id] = el }} className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() => setHintFor(v => v === item.id ? null : item.id)}
                    className="transition-colors"
                    style={{ color: hintFor === item.id ? 'var(--nav-text-primary)' : 'var(--nav-text-muted)' }}
                    aria-label="Сколько стоят варианты ответа"
                  >
                    <InfoIcon />
                  </button>
                  {hintFor === item.id && (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-10 w-60 rounded-xl p-3 text-xs leading-relaxed"
                      style={{ background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-secondary)', boxShadow: '0 20px 44px -18px rgba(10,10,15,0.35)' }}>
                      Первые 3 варианта — бесплатно, дальше 5 ₸ за генерацию. Списывается с единого кошелька.
                    </div>
                  )}
                </span>
              </div>
              <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
                {freeLeft > 0 ? `осталось ${freeLeft} из ${FREE_REGENS} бесплатных` : 'бесплатные закончились — 5 ₸ за вариант'}
              </div>
              <div className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                После отправки ответ станет шаблоном — похожие вопросы (по ключевым словам) получат его бесплатно и мгновенно
              </div>
              {errors[item.id] && <div className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{errors[item.id]}</div>}
              <div className="flex gap-2 mt-auto">
                <button onClick={() => act(item.id, 'send')} disabled={acting === item.id || regening === item.id}
                  className="flex-1 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  Отправить
                </button>
                <button onClick={() => act(item.id, 'skip')} disabled={acting === item.id || regening === item.id}
                  className="flex-1 nav-glass rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-secondary)' }}>
                  Пропустить
                </button>
              </div>
            </motion.div>
            )
          })}
        </div>
      </div>

      {toast && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
          className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 nav-glass rounded-xl px-4 py-3 text-sm font-medium max-w-[90vw]"
          style={{ color: 'var(--nav-text-primary)', boxShadow: 'var(--nav-card-glow)' }}
        >
          {toast}
        </motion.div>
      )}
    </main>
    </DesktopShell>
  )
}
