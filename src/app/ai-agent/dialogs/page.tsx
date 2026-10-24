'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { withTimeout, fetchWithTimeout } from '@/lib/loadGuard'
import LoadErrorCard from '@/components/LoadErrorCard'
import SiteNav from '@/components/SiteNav'
import AiAgentProUpsell from '@/components/aiAgent/AiAgentProUpsell'
import DesktopShell from '@/components/DesktopShell'
import LoadingSpinner from '@/components/LoadingSpinner'
import { getActivePlan } from '@/lib/plan'
import BrandLoader from '@/components/BrandLoader'
import Link from 'next/link'
import { useLanguage } from '@/components/LanguageProvider'
import { aiAgentSetupDict } from '@/lib/i18n/aiAgentSetup'
import { usePageDocumentTitle } from '@/lib/usePageDocumentTitle'
import { aiAgentDict } from '@/lib/i18n/aiAgent'

const EASE = [0.16, 1, 0.3, 1] as const

type DialogItem = {
  id: string; agentId: string; agentName: string; channel: string; source: string
  customerHandle: string; lastMessagePreview: string; lastActivityAt: string; pausedForHuman: boolean
}
type MessageItem = { id: string; direction: 'inbound' | 'outbound'; text: string; isAiGenerated: boolean; createdAt: string }

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
function WebsiteIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function ApiIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  )
}
// Every channel a conversation can arrive on. An unlisted one falls back to
// Instagram below, which is silently wrong rather than merely ugly: a draft
// from the website widget would be approved under an Instagram label, and the
// owner would answer it as if it were public. That is exactly what happened to
// website and api here until 2026-09-09.
const CHANNEL_META: Record<string, { label: string; icon: () => React.ReactElement }> = {
  instagram: { label: 'Instagram', icon: InstagramIcon },
  telegram: { label: 'Telegram', icon: TelegramIcon },
  whatsapp: { label: 'WhatsApp', icon: WhatsAppIcon },
  website: { label: 'Сайт', icon: WebsiteIcon },
  api: { label: 'API', icon: ApiIcon },
}

function formatRelative(iso: string): string {
  return new Date(iso).toLocaleString('ru-KZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function AiAgentDialogsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang } = useLanguage()
  const sd = aiAgentSetupDict[lang]
  usePageDocumentTitle(`${sd.dialogsTitle} — ${aiAgentDict[lang].agentPageTitle}`)
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  // Загрузка не удалась или зависла (>20 с): показываем «Повторить» вместо вечной заставки.
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [forbidden, setForbidden] = useState(false)
  // Про кончился, агенты есть (решение основателя 3, 16.10.2026): переписка
  // открыта на чтение -- без поля ответа и «Вернуть боту», с плашкой
  // «Продлите Про». Агент в это время клиентам не отвечает.
  const [readOnly, setReadOnly] = useState(false)
  const [items, setItems] = useState<DialogItem[]>([])
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [fetching, setFetching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Keep the thread scrolled to the newest message -- on first opening a
  // conversation, and again every time the list grows (a reply just sent,
  // or a fresh poll picking up a new inbound message).
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function authHeader() {
    const { data: { session } } = await withTimeout(supabase.auth.getSession())
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  // null -- сервер не пустил (403: ни тарифа, ни агентов).
  const loadItems = useCallback(async (agent: string = agentFilter): Promise<DialogItem[] | null> => {
    setFetching(true)
    try {
      const headers = await authHeader()
      const params = new URLSearchParams()
      if (agent !== 'all') params.set('agentId', agent)
      const qs = params.toString()
      const res = await fetchWithTimeout(`/api/ai-agent/dialogs${qs ? `?${qs}` : ''}`, { headers })
      let fetched: DialogItem[] = []
      if (res.status === 403) return null
      if (res.ok) {
        const data = await res.json()
        fetched = Array.isArray(data.items) ? data.items : []
        setItems(fetched)
        setReadOnly(!!data.readOnly)
      }
      return fetched
    } finally {
      setFetching(false)
    }
  }, [agentFilter])

  useEffect(() => {
    let redirected = false
    async function loadInner() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { redirected = true; router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      const hasPlan = !!profile?.is_admin || getActivePlan(profile).canAiAgent
      const headers = await authHeader()
      if (!hasPlan) {
        // Без Про -- только чтение, и только если агенты есть: решает сервер
        // (403 -- обычная Про-стена). Список агентов для фильтра -- из самих
        // диалогов: /api/ai-agent/agents без Про закрыт.
        const fetched = await loadItems('all')
        if (fetched === null) { setForbidden(true); setLoading(false); return }
        const byId = new Map<string, string>()
        for (const i of fetched) byId.set(i.agentId, i.agentName)
        setAgents(Array.from(byId, ([id, name]) => ({ id, name })))
        setLoading(false)
        return
      }
      // agents fetch + loadItems folded into one Promise.all (final-review
      // finding) -- loadItems doesn't need to wait for the agents response
      // to be handled first, so serializing it after was a needless extra
      // round-trip on first paint.
      const [agentsRes, fetchedOrNull] = await Promise.all([
        fetchWithTimeout('/api/ai-agent/agents', { headers }),
        loadItems('all'),
      ])
      const fetched = fetchedOrNull || []
      if (agentsRes.ok) {
        const data = await agentsRes.json()
        setAgents(Array.isArray(data.agents) ? data.agents.map((a: any) => ({ id: a.id, name: a.name })) : [])
      }
      // Deep link from a «Заявки» lead card -- only auto-open when the id
      // genuinely belongs to one of the caller's own conversations (a
      // stale/foreign id is silently ignored).
      const conversationParam = searchParams.get('conversation')
      if (conversationParam && fetched.some(i => i.id === conversationParam)) {
        openConversation(conversationParam)
      }
      setLoading(false)
    }
    let alive = true
    async function load() {
      setLoadError(false)
      try { await withTimeout(loadInner()) } catch { if (alive) setLoadError(true) } finally { if (alive && !redirected) setLoading(false) }
    }
    void load()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams, reloadKey])

  async function openConversation(id: string) {
    setSelectedId(id)
    setMessagesLoading(true)
    setError(null)
    // Clear any unsent draft from the previously selected conversation --
    // otherwise a half-typed reply to customer A can silently get sent to
    // customer B after switching (final-review finding).
    setReplyText('')
    const headers = await authHeader()
    const res = await fetch(`/api/ai-agent/dialogs/messages?conversationId=${encodeURIComponent(id)}`, { headers })
    if (res.ok) {
      const data = await res.json()
      setMessages(Array.isArray(data.messages) ? data.messages : [])
    }
    setMessagesLoading(false)
  }

  function changeAgent(id: string) {
    setAgentFilter(id)
    // The currently-open conversation may not belong to the newly-selected
    // agent and disappear from the filtered list -- clear the thread pane
    // (same clearing openConversation does when switching threads) so it
    // doesn't silently show a stale/blank pane with no explanation.
    setSelectedId(null)
    setReplyText('')
    loadItems(id)
  }

  async function sendReply() {
    if (!selectedId || !replyText.trim()) return
    setSending(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/dialogs/reply', {
        method: 'POST', headers, body: JSON.stringify({ conversationId: selectedId, text: replyText.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Не удалось отправить сообщение')
        return
      }
      setReplyText('')
      await openConversation(selectedId)
      await loadItems()
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSending(false)
    }
  }

  async function releaseConversation() {
    if (!selectedId) return
    setSending(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/dialogs/release', {
        method: 'POST', headers, body: JSON.stringify({ conversationId: selectedId }),
      })
      if (!res.ok) { setError('Не удалось вернуть диалог боту'); return }
      await loadItems()
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSending(false)
    }
  }

  const selected = items.find(i => i.id === selectedId) || null

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <BrandLoader />
    </main>
    </DesktopShell>
  )

  const retryLoad = () => { setLoading(true); setReloadKey(k => k + 1) }

  if (loadError) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <LoadErrorCard onRetry={retryLoad} />
    </main>
    </DesktopShell>
  )

  if (forbidden) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <AiAgentProUpsell />
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-7xl mx-auto p-4 lg:p-6 pb-6 flex flex-col" style={{ height: 'calc(100vh - 200px)', minHeight: 560 }}>
        <motion.div
          className="flex items-center justify-between gap-3 mb-4 flex-wrap flex-shrink-0"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{sd.dialogsTitle}</h1>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{readOnly ? sd.dialogsSubtitleReadOnly : sd.dialogsSubtitle}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {agents.length > 0 && (
              <select
                value={agentFilter}
                onChange={e => changeAgent(e.target.value)}
                aria-label="Выбор агента"
                className="nav-glass rounded-lg px-3 py-2 text-sm font-medium outline-none cursor-pointer"
                style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
              >
                <option value="all">Все агенты</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <button onClick={() => loadItems()} disabled={fetching} className="nav-glass rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ color: 'var(--nav-accent)' }}>
              {fetching ? 'Обновляем…' : 'Обновить'}
            </button>
          </div>
        </motion.div>

        {readOnly && (
          <div role="status" className="nav-glass rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{sd.lapsedTitle}</div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>{sd.lapsedText}</p>
            </div>
            <Link href="/upgrade"
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold flex-shrink-0 transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {sd.lapsedCta}
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 flex-1 min-h-0">
          <div className="space-y-2 overflow-y-auto" style={{ opacity: fetching ? 0.6 : 1 }}>
            {items.length === 0 && !fetching && (
              <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Пока нет ни одного диалога</div>
            )}
            {items.map(item => {
              const channel = CHANNEL_META[item.channel] || CHANNEL_META.instagram
              const ChannelIcon = channel.icon
              const active = selectedId === item.id
              return (
                <button key={item.id} onClick={() => openConversation(item.id)}
                  className="w-full text-left nav-glass rounded-2xl p-3 transition-colors"
                  style={{
                    // Needs-attention (paused_for_human) wins over the plain
                    // selection ring -- a founder request after the small
                    // corner badge alone proved too easy to miss in the list.
                    outline: item.pausedForHuman ? '2px solid var(--nav-critical)' : active ? '2px solid var(--nav-accent)' : 'none',
                    outlineOffset: -2,
                  }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold" style={{ color: 'var(--nav-text-secondary)' }}>
                      <ChannelIcon /> {channel.label}
                      {/* Only Instagram has both a public and a private
                          surface, so only there does this carry information.
                          A comment is read by everyone under the post and is
                          answered differently from a private message. */}
                      {item.channel === 'instagram' && (
                        <span className="px-1.5 py-0.5 rounded-full"
                          style={item.source === 'comment'
                            ? { background: 'var(--nav-teal)', color: '#fff' }
                            : { background: 'var(--nav-bg)', color: 'var(--nav-text-muted)' }}>
                          {item.source === 'comment' ? 'Комментарий' : 'Директ'}
                        </span>
                      )}
                    </span>
                    {item.pausedForHuman && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--nav-critical)', color: '#fff' }}>ждёт вас</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{item.customerHandle}</div>
                  {agentFilter === 'all' && agents.length > 1 && (
                    <div className="text-[11px] font-medium truncate" style={{ color: 'var(--nav-text-muted)' }}>{item.agentName}</div>
                  )}
                  <div className="text-xs truncate mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{item.lastMessagePreview}</div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>{formatRelative(item.lastActivityAt)}</div>
                </button>
              )
            })}
          </div>

          <div className="nav-glass rounded-2xl p-4 flex flex-col min-h-0">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Выберите диалог слева</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-3 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{selected.customerHandle}</div>
                    {agents.length > 1 && (
                      <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{selected.agentName}</div>
                    )}
                  </div>
                  {selected.pausedForHuman && !readOnly && (
                    <button onClick={releaseConversation} disabled={sending}
                      className="text-xs font-semibold nav-glass rounded-lg px-3 py-1.5 disabled:opacity-50" style={{ color: 'var(--nav-text-secondary)' }}>
                      Вернуть боту
                    </button>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 mb-3">
                  {messagesLoading ? (
                    <div className="text-center text-sm py-8" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
                  ) : messages.map(m => (
                    <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%] rounded-2xl px-3 py-2 text-sm"
                        style={{
                          background: m.direction === 'outbound' ? 'var(--nav-accent)' : 'var(--nav-bg)',
                          color: m.direction === 'outbound' ? 'var(--nav-accent-ink)' : 'var(--nav-text-primary)',
                        }}>
                        {m.text}
                        {m.direction === 'outbound' && (
                          <div className="text-[10px] mt-1 opacity-70">{m.isAiGenerated ? 'ИИ' : 'Вы'}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {error && <div className="text-xs mb-2 flex-shrink-0" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

                {!readOnly && <div className="flex gap-2 flex-shrink-0">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !sending) sendReply() }}
                    placeholder="Ваш ответ клиенту…"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <button onClick={sendReply} disabled={sending || !replyText.trim()}
                    className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    Отправить
                  </button>
                </div>}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}

export default function AiAgentDialogs() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AiAgentDialogsInner />
    </Suspense>
  )
}
