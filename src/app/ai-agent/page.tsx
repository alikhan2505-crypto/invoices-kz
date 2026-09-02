'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'

const EASE = [0.16, 1, 0.3, 1] as const

// Mirrors GOAL_OPTIONS in ./settings/page.tsx (values are the API's goal keys).
const GOAL_LABELS: Record<string, string> = {
  answer_questions: 'Отвечать на вопросы',
  qualify_lead: 'Квалифицировать заявку',
  book_appointment: 'Записать на консультацию/приём',
}

// The only statuses the code writes today: 'training' (column default on
// insert) and 'active' (set by the review route once training exits).
const STATUS_LABELS: Record<string, string> = {
  training: 'Обучается',
  active: 'Активен',
}

type AgentConnection = { channel: string; external_account_name: string | null; status: string }
type AgentListItem = {
  id: string
  name: string
  tone: string
  goal: string
  status: string
  createdAt: string
  connections: AgentConnection[]
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
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

function BotIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V5M12 5a1.5 1.5 0 1 0-.001-3.001A1.5 1.5 0 0 0 12 5Z" />
      <path d="M9 14h.01M15 14h.01" />
      <path d="M9.5 17.2c.7.5 1.6.8 2.5.8s1.8-.3 2.5-.8" />
    </svg>
  )
}

export default function AiAgentsList() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [deleteTarget, setDeleteTarget] = useState<AgentListItem | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Same admin-only client-side check as ./settings/page.tsx -- the real
      // enforcement is the API's 403 admin_only; this swaps a redirect for
      // an inline message.
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      if (!profile?.is_admin && !getActivePlan(profile).canAiAgent) { setForbidden(true); setLoading(false); return }
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/agents', { headers })
      if (res.ok) {
        const data = await res.json()
        setAgents(Array.isArray(data.agents) ? data.agents : [])
      }
      setLoading(false)
    }
    load()
  }, [router])

  async function deleteAgent() {
    if (!deleteTarget || confirmText !== deleteTarget.name) return
    setDeleting(true)
    setDeleteError(false)
    const headers = await authHeader()
    const res = await fetch(`/api/ai-agent/agents/${deleteTarget.id}`, { method: 'DELETE', headers })
    if (res.ok) {
      setAgents(prev => prev.filter(a => a.id !== deleteTarget.id))
      setDeleteTarget(null)
      setConfirmText('')
    } else {
      setDeleteError(true)
    }
    setDeleting(false)
  }

  function closeModal() {
    if (deleting) return
    setDeleteTarget(null)
    setConfirmText('')
    setDeleteError(false)
  }

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
          className="flex items-start justify-between gap-3 mb-6"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Агенты</h1>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Ваши AI-сотрудники, которые отвечают клиентам в Instagram</p>
          </div>
          {agents.length > 0 && (
            <Link href="/ai-agent/settings?new=1"
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold flex-shrink-0 transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
              <PlusIcon /> Создать агента
            </Link>
          )}
        </motion.div>

        {agents.length === 0 ? (
          <motion.div
            className="nav-glass nav-card-accent rounded-2xl p-8 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
          >
            <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-2xl" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
              <BotIcon />
            </div>
            <div className="text-base font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Пока нет ни одного агента</div>
            <p className="text-sm mb-5 max-w-sm mx-auto" style={{ color: 'var(--nav-text-secondary)' }}>
              Создайте AI-сотрудника, подключите Instagram — и он начнёт отвечать вашим клиентам на комментарии и сообщения.
            </p>
            <Link href="/ai-agent/settings?new=1"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
              <PlusIcon /> Создать первого агента
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {agents.map((agent, i) => {
              const instagram = agent.connections.find(c => c.channel === 'instagram')
              const statusLabel = STATUS_LABELS[agent.status] || agent.status
              const statusColor = agent.status === 'active' ? 'var(--nav-success)' : 'var(--nav-accent)'
              return (
                <motion.div
                  key={agent.id}
                  className="nav-glass nav-card-accent rounded-2xl relative"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 + i * 0.05 }}
                >
                  {/* The card body is one big link; the delete button below is
                      a SIBLING (not nested inside the link) absolutely
                      positioned in the top-right corner, clear of the title. */}
                  <Link href={`/ai-agent/settings?agent=${agent.id}`} className="block p-5">
                    <div className="flex items-center gap-2 mb-2 pr-10">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{agent.name}</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium flex-shrink-0" style={{ background: 'var(--nav-bg)', color: statusColor }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} aria-hidden />
                        {statusLabel}
                      </span>
                    </div>
                    <div className="text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{GOAL_LABELS[agent.goal] || agent.goal}</div>
                    {instagram?.status === 'active' ? (
                      <div className="text-xs flex items-center gap-1.5 mb-1" style={{ color: 'var(--nav-success)' }}>
                        <CheckCircleIcon /> Подключено: {instagram.external_account_name ? `@${instagram.external_account_name}` : 'Instagram'}
                      </div>
                    ) : instagram?.status === 'token_expired' ? (
                      <div className="text-xs flex items-center gap-1.5 mb-1" style={{ color: 'var(--nav-critical)' }}>
                        <WarnIcon /> Instagram отключился — переподключите
                      </div>
                    ) : (
                      <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Канал не подключён</div>
                    )}
                    <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                      Создан {new Date(agent.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </Link>
                  <button
                    onClick={() => { setDeleteTarget(agent); setConfirmText(''); setDeleteError(false) }}
                    aria-label={`Удалить агента ${agent.name}`}
                    className="absolute top-3 right-3 p-2 rounded-lg transition-colors hover:bg-[color:var(--nav-bg)]"
                    style={{ color: 'var(--nav-text-muted)' }}>
                    <TrashIcon />
                  </button>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* MoonAI-style hard-delete confirm (docs/superpowers/
          mooonai-research-findings.md §8): irreversibility warning +
          type-the-agent's-name gate before the delete button enables. */}
      <AnimatePresence>
        {deleteTarget && (
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
              aria-label="Удалить агента"
            >
              <div className="text-base font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Удалить агента</div>
              <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                Вы уверены, что хотите удалить агента «{deleteTarget.name}»?
              </p>
              <div className="rounded-lg px-3 py-2.5 text-xs mb-4 flex items-start gap-2" style={{ background: 'var(--nav-bg)', color: 'var(--nav-critical)' }}>
                <span className="mt-0.5"><WarnIcon /></span>
                <span>Будет удалено безвозвратно: все настройки, подключения и диалоги агента</span>
              </div>
              <label className="block mb-4">
                <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Для подтверждения введите название агента</span>
                <input
                  autoFocus
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') deleteAgent(); if (e.key === 'Escape') closeModal() }}
                  placeholder={deleteTarget.name}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-critical)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                  style={{ color: 'var(--nav-text-primary)', background: 'transparent' }} />
              </label>
              {deleteError && (
                <div className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>
                  Не удалось удалить агента. Попробуйте ещё раз.
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={closeModal} disabled={deleting}
                  className="flex-1 nav-glass rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                  style={{ color: 'var(--nav-text-primary)' }}>
                  Отмена
                </button>
                <button onClick={deleteAgent} disabled={deleting || confirmText !== deleteTarget.name}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'var(--nav-critical)', color: '#fff' }}>
                  {deleting ? 'Удаляем…' : 'Удалить'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
    </DesktopShell>
  )
}
