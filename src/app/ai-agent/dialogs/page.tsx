'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import LoadingSpinner from '@/components/LoadingSpinner'

const EASE = [0.16, 1, 0.3, 1] as const

type DialogItem = {
  id: string; agentId: string; agentName: string; channel: string
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
const CHANNEL_META: Record<string, { label: string; icon: () => React.ReactElement }> = {
  instagram: { label: 'Instagram', icon: InstagramIcon },
  telegram: { label: 'Telegram', icon: TelegramIcon },
  whatsapp: { label: 'WhatsApp', icon: WhatsAppIcon },
  website: { label: 'Сайт', icon: WebsiteIcon },
}

function formatRelative(iso: string): string {
  return new Date(iso).toLocaleString('ru-KZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function AiAgentDialogsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
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

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  const loadItems = useCallback(async (agent: string = agentFilter): Promise<DialogItem[]> => {
    setFetching(true)
    const headers = await authHeader()
    const params = new URLSearchParams()
    if (agent !== 'all') params.set('agentId', agent)
    const qs = params.toString()
    const res = await fetch(`/api/ai-agent/dialogs${qs ? `?${qs}` : ''}`, { headers })
    let fetched: DialogItem[] = []
    if (res.ok) {
      const data = await res.json()
      fetched = Array.isArray(data.items) ? data.items : []
      setItems(fetched)
    }
    setFetching(false)
    return fetched
  }, [agentFilter])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
      const headers = await authHeader()
      const agentsRes = await fetch('/api/ai-agent/agents', { headers })
      if (agentsRes.ok) {
        const data = await agentsRes.json()
        setAgents(Array.isArray(data.agents) ? data.agents.map((a: any) => ({ id: a.id, name: a.name })) : [])
      }
      const fetched = await loadItems('all')
      // Deep link from a «Заявки» lead card -- only auto-open when the id
      // genuinely belongs to one of the caller's own conversations (a
      // stale/foreign id is silently ignored).
      const conversationParam = searchParams.get('conversation')
      if (conversationParam && fetched.some(i => i.id === conversationParam)) {
        openConversation(conversationParam)
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams])

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
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (forbidden) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Эта функция пока доступна только администраторам.</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-7xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="flex items-center justify-between gap-3 mb-4 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Переписка</h1>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Живая переписка с клиентами по всем каналам — перехватите диалог, просто ответив</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          <div className="space-y-2" style={{ opacity: fetching ? 0.6 : 1 }}>
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

          <div className="nav-glass rounded-2xl p-4 flex flex-col" style={{ minHeight: 420 }}>
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Выберите диалог слева</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{selected.customerHandle}</div>
                    {agents.length > 1 && (
                      <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{selected.agentName}</div>
                    )}
                  </div>
                  {selected.pausedForHuman && (
                    <button onClick={releaseConversation} disabled={sending}
                      className="text-xs font-semibold nav-glass rounded-lg px-3 py-1.5 disabled:opacity-50" style={{ color: 'var(--nav-text-secondary)' }}>
                      Вернуть боту
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 mb-3" style={{ maxHeight: 420 }}>
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
                </div>

                {error && <div className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

                <div className="flex gap-2">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !sending) sendReply() }}
                    placeholder="Ваш ответ клиенту…"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <button onClick={sendReply} disabled={sending || !replyText.trim()}
                    className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    Отправить
                  </button>
                </div>
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
