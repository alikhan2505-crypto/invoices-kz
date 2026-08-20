'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
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

function hasActiveTelegram(agent: Agent): boolean {
  return agent.connections.some(c => c.channel === 'telegram' && c.status === 'active')
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

function TelegramDot({ ok }: { ok: boolean }) {
  return <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ok ? 'var(--nav-teal)' : 'var(--nav-text-muted)' }} />
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

  const telegramAgents = agents.filter(hasActiveTelegram)

  const loadPreview = useCallback(async (agentId: string) => {
    setRecipientCount(null)
    if (!agentId) return
    const headers = await authHeaders()
    const res = await fetch(`/api/ai-agent/broadcasts?agentId=${encodeURIComponent(agentId)}&preview=1`, { headers })
    if (res.ok) {
      const payload = await res.json()
      setRecipientCount(typeof payload.recipients === 'number' ? payload.recipients : 0)
    } else {
      setRecipientCount(0)
    }
  }, [authHeaders])

  function openModal() {
    const first = telegramAgents[0]
    setSelectedAgentId(first?.id || '')
    setMessage('')
    setStage('compose')
    setSendResult(null)
    setSendError(null)
    setModalOpen(true)
    if (first) loadPreview(first.id)
    else setRecipientCount(null)
  }

  function closeModal() {
    // Don't allow dismissing mid-send -- the POST is doing the actual
    // Telegram sends and the summary is worth seeing.
    if (stage === 'sending') return
    setModalOpen(false)
    if (stage === 'done') loadBroadcasts()
  }

  function changeAgent(id: string) {
    setSelectedAgentId(id)
    setStage('compose')
    setSendError(null)
    loadPreview(id)
  }

  async function sendBroadcast() {
    setStage('sending')
    setSendError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/ai-agent/broadcasts', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, message: message.trim() }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        if (payload?.error === 'no_recipients') setSendError('Вашему боту ещё никто не писал — рассылать пока некому.')
        else if (payload?.error === 'telegram_not_connected') setSendError('У этого агента нет активного Telegram-бота.')
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
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Сообщение всем клиентам, которые писали вашему Telegram-боту</p>
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
              Рассылки работают через канал Telegram-бот — сначала{' '}
              <Link href="/ai-agent/settings?tab=channels" className="font-semibold underline underline-offset-2" style={{ color: 'var(--nav-accent)' }}>
                подключите бота
              </Link>
              {' '}к вашему агенту. Получатели — все, кто уже писал боту.
            </p>
            <p className="text-[11px] max-w-sm mx-auto" style={{ color: 'var(--nav-text-muted)' }}>
              Рассылки по WhatsApp появятся после подключения WhatsApp Business API.
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
                    <TelegramDot ok={b.failedCount === 0} />
                    {b.agentName}
                    <span className="font-medium" style={{ color: 'var(--nav-text-muted)' }}>· Telegram</span>
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
                        const ok = hasActiveTelegram(a)
                        return (
                          <option key={a.id} value={a.id} disabled={!ok}>
                            {a.name}{ok ? '' : ' — нужен Telegram-бот'}
                          </option>
                        )
                      })}
                    </select>
                  </label>

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
                  <div className="flex items-center justify-between mb-4 text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                    <span>
                      {selectedAgentId
                        ? recipientCount === null
                          ? 'Считаем получателей…'
                          : `Получателей: ${recipientCount}`
                        : 'Выберите агента с Telegram-ботом'}
                    </span>
                    <span>{message.length}/{MAX_MESSAGE_LEN}</span>
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
