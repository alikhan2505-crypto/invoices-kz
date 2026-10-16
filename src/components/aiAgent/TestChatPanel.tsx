'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { aiAgentFormsDict, type AiAgentFormsDict } from '@/lib/i18n/aiAgentForms'

const EASE = [0.16, 1, 0.3, 1] as const

// = AI_AGENT_CREDIT_PRICE_TENGE × AI_AGENT_CREDITS_PER_AI_REPLY from
// src/lib/aiAgent/wallet.ts -- not imported: that module (via
// kaspiPay/wallet.ts) constructs a service-role Supabase client at module
// scope, which must never end up in a client bundle. Keep in sync manually.
const REPLY_PRICE_TENGE = 5

// source: what produced an agent reply (test-chat route). Only 'ai' is paid;
// the rest are the free tiers a live channel answers with first, plus the
// canned text a live channel sends while the wallet is empty.
type ReplySource = 'ai' | 'template' | 'flow' | 'stop_phrase' | 'budget_depleted'
type ChatMessage = { role: 'user' | 'agent'; text: string; source?: ReplySource }

function replyNote(source: ReplySource | undefined, tf: AiAgentFormsDict): string {
  if (source === 'template') return tf.testChatNoteTemplate
  if (source === 'flow') return tf.testChatNoteFlow
  if (source === 'stop_phrase') return tf.testChatNoteStopPhrase
  if (source === 'budget_depleted') return tf.testChatNoteBudgetDepleted
  return `≈ ${REPLY_PRICE_TENGE} ₸`
}

function BotIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V5M12 5a1.5 1.5 0 1 0-.001-3.001A1.5 1.5 0 0 0 12 5Z" />
      <path d="M9 14h.01M15 14h.01" />
      <path d="M9.5 17.2c.7.5 1.6.8 2.5.8s1.8-.3 2.5-.8" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function RestartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}

// Three pulsing dots while the agent reply is in flight. Under
// prefers-reduced-motion the dots render static (no infinite loop).
function TypingIndicator({ reduceMotion, label }: { reduceMotion: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1" role="img" aria-label={label}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--nav-text-muted)' }}
          initial={false}
          animate={reduceMotion ? { opacity: 0.55 } : { opacity: [0.25, 1, 0.25] }}
          transition={reduceMotion ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
        />
      ))}
    </span>
  )
}

// The actual chat UI/logic shared by the full-page test chat
// (src/app/ai-agent/test-chat/page.tsx, which owns the agent picker) and the
// slide-over panel on /ai-agent/settings (which is scoped to whichever
// agent is currently being edited). Transcript is client-only, never
// persisted -- same contract as the API route it calls.
//
// `fill`: the full page hosts this inside normal document flow with a
// capped viewport-relative height; the settings slide-over hosts it inside
// a flex column that already owns the available height, so the transcript
// should grow to fill that instead of re-capping itself.
//
// `suggestions` (мастер /ai-agent/setup, 16.10.2026): готовые вопросы-кнопки
// над полем ввода -- нажатие сразу отправляет вопрос, как будто его набрали.
export default function TestChatPanel({ agentId, fill = false, suggestions }: { agentId: string; fill?: boolean; suggestions?: string[] }) {
  const { lang } = useLanguage()
  const tf = aiAgentFormsDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const prevAgentIdRef = useRef(agentId)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  // A different agentId means a different persona -- the old transcript
  // would be misleading context, so it resets whenever the caller swaps
  // agents under us (only the full-page picker does this today).
  useEffect(() => {
    if (prevAgentIdRef.current === agentId) return
    prevAgentIdRef.current = agentId
    setMessages([])
    setInput('')
    setSendError(false)
  }, [agentId])

  // Keep the newest message in view.
  useEffect(() => {
    const el = transcriptRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  async function send(preset?: string) {
    const text = (preset ?? input).trim()
    if (!text || !agentId || sending) return
    const historyBefore = messages
    setMessages(prev => [...prev, { role: 'user', text }])
    if (preset === undefined) setInput('')
    setSending(true)
    setSendError(false)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/test-chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ agentId, message: text, history: historyBefore }),
      })
      if (!res.ok) throw new Error('request failed')
      const data = await res.json()
      const source: ReplySource | undefined = ['ai', 'template', 'flow', 'stop_phrase', 'budget_depleted'].includes(data.source) ? data.source : undefined
      setMessages(prev => [...prev, { role: 'agent', text: String(data.replyText || ''), source }])
    } catch {
      setSendError(true)
    }
    setSending(false)
  }

  function restartChat() {
    setMessages([])
    setSendError(false)
    setShowRestartConfirm(false)
  }

  return (
    <>
      <div
        className="nav-glass nav-card-accent rounded-2xl flex flex-col"
        style={fill ? { flex: '1 1 auto', minHeight: 0 } : undefined}
      >
        <div className="flex items-center justify-end px-3 lg:px-4 pt-2.5 lg:pt-3">
          <button
            onClick={() => setShowRestartConfirm(true)}
            disabled={messages.length === 0 && !sending}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors hover:bg-[color:var(--nav-bg)]"
            style={{ color: 'var(--nav-text-secondary)' }}
          >
            <RestartIcon /> {tf.testChatRestart}
          </button>
        </div>

        <div
          ref={transcriptRef}
          className="flex-1 overflow-y-auto p-4 lg:p-5 flex flex-col gap-3"
          style={fill ? { minHeight: 0 } : { minHeight: '300px', maxHeight: '55vh' }}
          aria-live="polite"
        >
          {messages.length === 0 && !sending && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10">
              <div className="mb-3 flex items-center justify-center w-11 h-11 rounded-2xl" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                <BotIcon size={22} />
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{tf.testChatEmptyTitle}</div>
              <p className="text-xs max-w-xs" style={{ color: 'var(--nav-text-muted)' }}>
                {tf.testChatEmptyText}
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <motion.div
              key={i}
              className={m.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[85%] flex items-start gap-2'}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
            >
              {m.role === 'agent' && (
                <span
                  className="mt-1 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}
                  aria-hidden
                >
                  <BotIcon size={15} />
                </span>
              )}
              <div>
                <div
                  className="rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words"
                  style={m.role === 'user'
                    ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', borderBottomRightRadius: '6px' }
                    : { background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', borderBottomLeftRadius: '6px' }}
                >
                  {m.text}
                </div>
                {m.role === 'agent' && (
                  <div className="text-[10.5px] mt-1 px-1" style={{ color: m.source === 'budget_depleted' ? 'var(--nav-critical)' : 'var(--nav-text-muted)' }}>
                    {replyNote(m.source, tf)}
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {sending && (
            <motion.div
              className="self-start flex items-center gap-2"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}
                aria-hidden
              >
                <BotIcon size={15} />
              </span>
              <span className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--nav-bg)', borderBottomLeftRadius: '6px' }}>
                <TypingIndicator reduceMotion={reduceMotion} label={tf.testChatTyping} />
              </span>
            </motion.div>
          )}
        </div>

        {sendError && (
          <div className="mx-4 lg:mx-5 mb-2 rounded-lg px-3 py-2.5 text-xs flex items-start gap-2" style={{ background: 'var(--nav-bg)', color: 'var(--nav-critical)' }}>
            <span className="mt-0.5"><WarnIcon /></span>
            <span>{tf.testChatSendError}</span>
          </div>
        )}

        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 lg:px-4 pt-3 border-t border-[color:var(--nav-border)]">
            {suggestions.map(q => (
              <button key={q} type="button" onClick={() => send(q)} disabled={sending}
                className="text-xs font-medium rounded-full px-3 py-1.5 transition-colors disabled:opacity-50 hover:bg-[color:var(--nav-accent-soft)]"
                style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                {q}
              </button>
            ))}
          </div>
        )}

        <form
          className={`flex items-center gap-2 p-3 lg:p-4 ${suggestions && suggestions.length > 0 ? '' : 'border-t border-[color:var(--nav-border)]'}`}
          onSubmit={e => { e.preventDefault(); send() }}
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={tf.testChatPlaceholder}
            maxLength={2000}
            aria-label={tf.testChatInputAria}
            className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
            style={{ color: 'var(--nav-text-primary)', background: 'transparent' }}
          />
          <button
            type="submit"
            disabled={sending || input.trim().length === 0}
            aria-label={tf.testChatSendAria}
            className="flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0 disabled:opacity-40 transition-transform hover:-translate-y-0.5"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
          >
            <SendIcon />
          </button>
        </form>
      </div>

      {/* Restart confirm -- same centered-modal pattern as ../page.tsx's
          delete confirm, without the type-to-confirm gate (clearing a
          client-only transcript is low-stakes). */}
      <AnimatePresence>
        {showRestartConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE } }}
            onClick={() => setShowRestartConfirm(false)}
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
              aria-label={tf.testChatRestart}
            >
              <div className="text-base font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{tf.testChatRestart}</div>
              <p className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>
                {tf.testChatRestartText}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowRestartConfirm(false)}
                  className="flex-1 nav-glass rounded-lg px-4 py-2.5 text-sm font-medium"
                  style={{ color: 'var(--nav-text-primary)' }}>
                  {tf.cancelButton}
                </button>
                <button onClick={restartChat}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {tf.testChatRestartConfirm}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
