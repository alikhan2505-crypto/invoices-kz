'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { buildAgentSettingsHref } from '@/lib/aiAgent/settingsLink'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const
const MAX_MESSAGE_LEN = 2000

type ConnectionInfo = { channel: string; external_account_name: string | null; status: string }
type Agent = { id: string; name: string; connections: ConnectionInfo[] }
type Broadcast = {
  id: string
  agentId: string
  agentName: string
  channel: string
  message: string
  recipientsTotal: number
  sentCount: number
  failedCount: number
  status: string
  createdAt: string
}
type SendResult = { recipientsTotal: number; sentCount: number; failedCount: number }
// compose -> confirm (inline swap, not a browser confirm) -> sending -> done
type ModalStage = 'compose' | 'confirm' | 'sending' | 'done'
type BroadcastChannel = 'telegram' | 'whatsapp'

function hasActiveTelegram(agent: Agent): boolean {
  return agent.connections.some(c => c.channel === 'telegram' && c.status === 'active')
}

function hasActiveWhatsApp(agent: Agent): boolean {
  return agent.connections.some(c => c.channel === 'whatsapp' && c.status === 'active')
}

// Channels this agent can broadcast on, in a stable preferred order --
// used both to disable agents with neither channel connected and to decide
// whether the compose modal needs a channel picker (only when there's more
// than one).
function availableChannels(agent: Agent | undefined): BroadcastChannel[] {
  if (!agent) return []
  const chans: BroadcastChannel[] = []
  if (hasActiveTelegram(agent)) chans.push('telegram')
  if (hasActiveWhatsApp(agent)) chans.push('whatsapp')
  return chans
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function MegaphoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l18-7-4 14-6-3.5L7 18v-4z" />
    </svg>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ok ? 'var(--nav-teal)' : 'var(--nav-text-muted)' }} />
}

// Same inline-per-file icon convention as ai-agent/review/page.tsx and
// ai-agent/settings/page.tsx (this codebase duplicates small icon
// components per-file rather than importing them cross-file).
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

function ChannelBadge({ channel }: { channel: string }) {
  return channel === 'whatsapp' ? <WhatsAppIcon /> : <TelegramIcon />
}

export default function AiAgentBroadcasts() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [stage, setStage] = useState<ModalStage>('compose')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [channel, setChannel] = useState<BroadcastChannel>('telegram')
  const [message, setMessage] = useState('')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const authHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}` }
  }, [])

  const loadBroadcasts = useCallback(async () => {
    const headers = await authHeaders()
    const res = await fetch('/api/ai-agent/broadcasts', { headers })
    if (res.ok) {
      const payload = await res.json()
      setBroadcasts(Array.isArray(payload.broadcasts) ? payload.broadcasts : [])
    }
  }, [authHeaders])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Same admin-only client-side check as ../analytics/page.tsx -- the
      // real enforcement is the API's 403 admin_only; this swaps a redirect
      // for an inline message.
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
      const headers = await authHeaders()
      const res = await fetch('/api/ai-agent/agents', { headers })
      if (res.ok) {
        const payload = await res.json()
        setAgents(Array.isArray(payload.agents)
          ? payload.agents.map((a: any) => ({ id: a.id, name: a.name, connections: Array.isArray(a.connections) ? a.connections : [] }))
          : [])
      }
      await loadBroadcasts()
      setLoading(false)
    }
    load()
  }, [router, authHeaders, loadBroadcasts])

  // An agent is selectable for broadcasts once it has AT LEAST ONE
  // broadcastable channel connected (Telegram, WhatsApp, or both) -- which
  // specific channel gets used is chosen per-broadcast below.
  const broadcastableAgents = agents.filter(a => hasActiveTelegram(a) || hasActiveWhatsApp(a))

  const loadPreview = useCallback(async (agentId: string, ch: BroadcastChannel) => {
    setRecipientCount(null)
    if (!agentId) return
    const headers = await authHeaders()
    const res = await fetch(`/api/ai-agent/broadcasts?agentId=${encodeURIComponent(agentId)}&preview=1&channel=${ch}`, { headers })
    if (res.ok) {
      const payload = await res.json()
      setRecipientCount(typeof payload.recipients === 'number' ? payload.recipients : 0)
    } else {
      setRecipientCount(0)
    }
  }, [authHeaders])

  function openModal() {
    const first = broadcastableAgents[0]
    setSelectedAgentId(first?.id || '')
    setMessage('')
    setStage('compose')
    setSendResult(null)
    setSendError(null)
    setModalOpen(true)
    if (first) {
      // Both channels active -> default to Telegram and let the picker
      // switch; only one active -> use it silently, no picker shown.
      const initialChannel = availableChannels(first)[0] || 'telegram'
      setChannel(initialChannel)
      loadPreview(first.id, initialChannel)
    } else {
      setChannel('telegram')
      setRecipientCount(null)
    }
  }

  function closeModal() {
    // Don't allow dismissing mid-send -- the POST is doing the actual sends
    // and the summary is worth seeing.
    if (stage === 'sending') return
    setModalOpen(false)
    if (stage === 'done') loadBroadcasts()
  }

  function changeAgent(id: string) {
    setSelectedAgentId(id)
    setStage('compose')
    setSendError(null)
    const nextChannel = availableChannels(agents.find(a => a.id === id))[0] || 'telegram'
    setChannel(nextChannel)
    loadPreview(id, nextChannel)
  }

  function changeChannel(c: BroadcastChannel) {
    setChannel(c)
    setStage('compose')
    setSendError(null)
    loadPreview(selectedAgentId, c)
  }

  async function sendBroadcast() {
    setStage('sending')
    setSendError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/ai-agent/broadcasts', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, message: message.trim(), channel }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        // no_recipients' server-side `detail` is already channel-aware
        // (explains the WhatsApp 24h window honestly rather than implying
        // nobody ever wrote in), so surface it directly.
        if (payload?.error === 'no_recipients') setSendError(payload?.detail || 'Рассылать пока некому.')
        else if (payload?.error === 'telegram_not_connected') setSendError('У этого агента нет активного Telegram-бота.')
        else if (payload?.error === 'whatsapp_not_connected') setSendError('У этого агента нет активного WhatsApp-номера.')
        else setSendError('Не удалось отправить рассылку. Попробуйте ещё раз.')
        setStage('compose')
        return
      }
      setSendResult({ recipientsTotal: payload.recipientsTotal, sentCount: payload.sentCount, failedCount: payload.failedCount })
      setStage('done')
    } catch {
      setSendError('Не удалось отправить рассылку. Попробуйте ещё раз.')
      setStage('compose')
    }
  }

  const canSend = !!selectedAgentId && message.trim().length > 0 && (recipientCount ?? 0) > 0

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
      <div className="max-w-3xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="flex items-start justify-between gap-3 mb-6 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Рассылки</h1>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Сообщение всем клиентам, которые писали вашему агенту в Telegram или WhatsApp</p>
          </div>
          <button
            onClick={openModal}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-transform hover:-translate-y-0.5 flex-shrink-0"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
          >
            + Новая рассылка
          </button>
        </motion.div>

        {broadcasts.length === 0 ? (
          <motion.div
            className="nav-glass nav-card-accent rounded-2xl p-8 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.08 }}
          >
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-3" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
              <MegaphoneIcon />
            </div>
            <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
              Вы ещё не создали ни одной рассылки
            </div>
            <p className="text-xs mb-4 max-w-sm mx-auto" style={{ color: 'var(--nav-text-secondary)' }}>
              Рассылки работают через подключённые каналы — сначала{' '}
              <Link href={buildAgentSettingsHref('all', agents, 'channels')} className="font-semibold underline underline-offset-2" style={{ color: 'var(--nav-accent)' }}>
                подключите Telegram-бота или WhatsApp
              </Link>
              {' '}к вашему агенту. Получатели — те, кто уже писал в этот канал.
            </p>
            <p className="text-[11px] max-w-sm mx-auto" style={{ color: 'var(--nav-text-muted)' }}>
              Для WhatsApp это только клиенты, писавшие за последние 24 часа — таковы правила Meta.
            </p>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-3">
            {broadcasts.map((b, i) => (
              <motion.div
                key={b.id}
                className="nav-glass nav-card-accent rounded-2xl p-[15px_17px]"
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 + Math.min(i, 6) * 0.04 }}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <div className="flex items-center gap-2 text-[11.5px] font-bold" style={{ color: 'var(--nav-text-secondary)' }}>
                    <StatusDot ok={b.failedCount === 0} />
                    {b.agentName}
                    <span className="inline-flex items-center gap-1 font-medium" style={{ color: 'var(--nav-text-muted)' }}>
                      · <ChannelBadge channel={b.channel} /> {b.channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{formatDate(b.createdAt)}</div>
                </div>
                <p className="text-sm mb-2" style={{ color: 'var(--nav-text-primary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {b.message}
                </p>
                <div className="flex items-center gap-3 text-[11.5px] font-semibold flex-wrap">
                  <span style={{ color: 'var(--nav-teal)' }}>
                    {b.status === 'sending' ? 'Отправляется…' : `Отправлено ${b.sentCount} из ${b.recipientsTotal}`}
                  </span>
                  {b.failedCount > 0 && (
                    <span style={{ color: 'var(--nav-critical)' }}>Не доставлено: {b.failedCount}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE } }}
            onClick={closeModal}
          >
            <motion.div
              className="w-full max-w-md rounded-3xl p-6"
              style={{ background: 'var(--nav-surface-chrome)' }}
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.2, ease: EASE } }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Новая рассылка"
            >
              {stage === 'done' && sendResult ? (
                <>
                  <div className="text-base font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Рассылка отправлена</div>
                  <p className="text-sm mb-1.5" style={{ color: 'var(--nav-text-secondary)' }}>
                    Отправлено {sendResult.sentCount} из {sendResult.recipientsTotal} получателей.
                  </p>
                  {sendResult.failedCount > 0 && (
                    <p className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>
                      Не доставлено: {sendResult.failedCount} — обычно это клиенты, которые заблокировали бота.
                    </p>
                  )}
                  <button
                    onClick={closeModal}
                    className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold mt-3"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
                  >
                    Готово
                  </button>
                </>
              ) : (
                <>
                  <div className="text-base font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>Новая рассылка</div>

                  <label className="block mb-3">
                    <span className="text-xs mb-1 block font-medium" style={{ color: 'var(--nav-text-secondary)' }}>Агент</span>
                    <select
                      value={selectedAgentId}
                      onChange={e => changeAgent(e.target.value)}
                      disabled={stage === 'sending'}
                      className="w-full nav-glass rounded-lg px-3 py-2 text-sm font-medium outline-none cursor-pointer disabled:opacity-50"
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    >
                      {agents.length === 0 && <option value="">Нет агентов</option>}
                      {agents.map(a => {
                        const ok = hasActiveTelegram(a) || hasActiveWhatsApp(a)
                        return (
                          <option key={a.id} value={a.id} disabled={!ok}>
                            {a.name}{ok ? '' : ' — нужен канал (Telegram или WhatsApp)'}
                          </option>
                        )
                      })}
                    </select>
                  </label>

                  {selectedAgentId && availableChannels(agents.find(a => a.id === selectedAgentId)).length > 1 && (
                    <div className="flex gap-2 mb-3">
                      {(['telegram', 'whatsapp'] as const).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => changeChannel(c)}
                          disabled={stage === 'sending'}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                          style={{
                            background: channel === c ? 'var(--nav-accent)' : 'var(--nav-bg)',
                            color: channel === c ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
                          }}
                        >
                          <ChannelBadge channel={c} />
                          {c === 'telegram' ? 'Telegram' : 'WhatsApp'}
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="block mb-2">
                    <span className="text-xs mb-1 block font-medium" style={{ color: 'var(--nav-text-secondary)' }}>Сообщение</span>
                    <textarea
                      value={message}
                      onChange={e => { setMessage(e.target.value.slice(0, MAX_MESSAGE_LEN)); setStage(s => s === 'confirm' ? 'compose' : s) }}
                      disabled={stage === 'sending'}
                      rows={5}
                      maxLength={MAX_MESSAGE_LEN}
                      placeholder="Например: с 25 августа новые цены — успейте заказать по старым"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)] resize-none disabled:opacity-50"
                      style={{ color: 'var(--nav-text-primary)', background: 'transparent' }}
                    />
                  </label>
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                      <span>
                        {selectedAgentId
                          ? recipientCount === null
                            ? 'Считаем получателей…'
                            : `Получателей: ${recipientCount}`
                          : 'Выберите агента с подключённым каналом'}
                      </span>
                      <span>{message.length}/{MAX_MESSAGE_LEN}</span>
                    </div>
                    {selectedAgentId && channel === 'whatsapp' && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                        Только клиенты, которые писали за последние 24 часа (правило WhatsApp).
                      </p>
                    )}
                  </div>

                  {sendError && (
                    <div className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>{sendError}</div>
                  )}

                  {stage === 'sending' ? (
                    <div className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-center" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                      Отправляем… не закрывайте страницу
                    </div>
                  ) : stage === 'confirm' ? (
                    // Inline confirm swap -- the same button row becomes the
                    // question, no browser confirm().
                    <div>
                      <div className="text-sm font-semibold mb-2 text-center" style={{ color: 'var(--nav-text-primary)' }}>
                        Отправить {recipientCount} получателям?
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setStage('compose')}
                          className="flex-1 nav-glass rounded-lg px-4 py-2.5 text-sm font-medium"
                          style={{ color: 'var(--nav-text-primary)' }}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={sendBroadcast}
                          className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold"
                          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
                        >
                          Да, отправить
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={closeModal}
                        className="flex-1 nav-glass rounded-lg px-4 py-2.5 text-sm font-medium"
                        style={{ color: 'var(--nav-text-primary)' }}
                      >
                        Отмена
                      </button>
                      <button
                        onClick={() => setStage('confirm')}
                        disabled={!canSend}
                        className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
                      >
                        Отправить рассылку
                      </button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
    </DesktopShell>
  )
}
