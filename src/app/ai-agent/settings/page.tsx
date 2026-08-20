'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

const TONE_OPTIONS = [
  { value: 'friendly', label: 'Дружелюбный и тёплый' },
  { value: 'professional', label: 'Профессиональный и деловой' },
  { value: 'energetic', label: 'Мотивирующий и энергичный' },
  { value: 'caring', label: 'Заботливый и внимательный' },
]

const GOAL_OPTIONS = [
  { value: 'answer_questions', label: 'Отвечать на вопросы' },
  { value: 'qualify_lead', label: 'Квалифицировать заявку' },
]

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export default function AiAgentSettings() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [tone, setTone] = useState('friendly')
  const [businessDescription, setBusinessDescription] = useState('')
  const [goal, setGoal] = useState('answer_questions')
  const [collectName, setCollectName] = useState(true)
  const [collectPhone, setCollectPhone] = useState(true)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [connections, setConnections] = useState<{ channel: string; external_account_name: string | null; status: string }[]>([])
  const [connecting, setConnecting] = useState(false)
  const [oauthNotice, setOauthNotice] = useState<'connected' | 'error' | null>(null)
  const [forbidden, setForbidden] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  useEffect(() => {
    // The Instagram OAuth callback redirects back here with a plain query
    // flag (no Authorization header exists on that server-side redirect to
    // report anything richer) -- read it once client-side and strip it from
    // the URL so a page refresh doesn't keep re-showing the notice.
    const params = new URLSearchParams(window.location.search)
    if (params.has('instagram_connected')) setOauthNotice('connected')
    else if (params.has('instagram_error')) setOauthNotice('error')
    if (params.has('instagram_connected') || params.has('instagram_error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // AI-агент is admin-only for now -- same client-side is_admin check this
      // codebase already uses on /admin and every kaspi-shop/* page. The real
      // enforcement is server-side (the API routes below now 403 admin_only
      // for non-admins); this just swaps their redirect-to-/dashboard for an
      // inline message, since a redirect can misfire on a legitimate admin
      // session that hasn't finished loading yet.
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/settings', { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.agent) {
          setAgentId(data.agent.id)
          setName(data.agent.name)
          setTone(data.agent.tone)
          setBusinessDescription(data.agent.businessDescription)
          setGoal(data.agent.goal)
          setCollectName(data.agent.collectName)
          setCollectPhone(data.agent.collectPhone)
        } else {
          setName(data.suggestedName || 'Ассистент')
        }
        setConnections(data.connections || [])
      }
      setLoading(false)
    }
    load()
  }, [router])

  async function save() {
    setSaving(true)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/settings', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, tone, businessDescription, goal, collectName, collectPhone }),
    })
    if (res.ok) {
      const data = await res.json()
      setAgentId(data.agent.id)
    }
    setSaving(false)
  }

  async function connectInstagram() {
    setConnecting(true)
    setOauthNotice(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/instagram/connect', { headers })
      if (res.ok) {
        const data = await res.json()
        window.location.href = data.authorizeUrl
      } else {
        setOauthNotice('error')
        setConnecting(false)
      }
    } catch {
      setOauthNotice('error')
      setConnecting(false)
    }
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

  const instagramConnection = connections.find(c => c.channel === 'instagram')

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>AI-агент</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>Настройте ассистента, который отвечает вашим клиентам в Instagram</p>
        </motion.div>

        {oauthNotice === 'connected' && (
          <div className="rounded-lg px-3 py-2 text-sm mb-4 flex items-center gap-2" style={{ background: 'var(--nav-success)', color: '#fff' }}>
            <CheckCircleIcon /> Instagram подключён
          </div>
        )}
        {oauthNotice === 'error' && (
          <div className="rounded-lg px-3 py-2 text-sm mb-4" style={{ background: 'var(--nav-critical)', color: '#fff' }}>
            Не удалось подключить Instagram. Попробуйте ещё раз — если не получится снова, напишите в поддержку.
          </div>
        )}

        <motion.div
          className="nav-glass nav-card-accent rounded-2xl p-5"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
        >
          <label className="block mb-4">
            <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Название компании</span>
            <input
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
              style={{ color: 'var(--nav-text-primary)' }}
              value={name} onChange={e => setName(e.target.value)} />
          </label>

          <div className="mb-4">
            <span className="text-xs mb-2 block" style={{ color: 'var(--nav-text-secondary)' }}>Формат общения</span>
            <div className="grid grid-cols-2 gap-2">
              {TONE_OPTIONS.map(t => {
                const active = tone === t.value
                return (
                  <button key={t.value} onClick={() => setTone(t.value)}
                    className="text-xs px-3 py-2 rounded-lg text-left transition-colors"
                    style={active ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block mb-4">
            <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>О бизнесе</span>
            <textarea
              className="w-full rounded-lg px-3 py-2 text-sm min-h-[100px] outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
              style={{ color: 'var(--nav-text-primary)' }}
              placeholder="Опишите подробнее что вы продаёте и как работаете"
              value={businessDescription} onChange={e => setBusinessDescription(e.target.value)} />
          </label>

          <div className="mb-4">
            <span className="text-xs mb-2 block" style={{ color: 'var(--nav-text-secondary)' }}>Основная цель</span>
            <div className="grid grid-cols-2 gap-2">
              {GOAL_OPTIONS.map(g => {
                const active = goal === g.value
                return (
                  <button key={g.value} onClick={() => setGoal(g.value)}
                    className="text-xs px-3 py-2 rounded-lg transition-colors"
                    style={active ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                    {g.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mb-6">
            <span className="text-xs mb-2 block" style={{ color: 'var(--nav-text-secondary)' }}>Что собирать у клиента</span>
            <label className="flex items-center gap-2 text-sm mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
              <input type="checkbox" checked={collectName} onChange={e => setCollectName(e.target.checked)} className="accent-[var(--nav-accent)] w-3.5 h-3.5" /> Имя
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--nav-text-primary)' }}>
              <input type="checkbox" checked={collectPhone} onChange={e => setCollectPhone(e.target.checked)} className="accent-[var(--nav-accent)] w-3.5 h-3.5" /> Телефон
            </label>
          </div>

          <button onClick={save} disabled={saving}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>

          {agentId && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
              <span className="text-xs mb-2 block" style={{ color: 'var(--nav-text-secondary)' }}>Instagram</span>
              {instagramConnection?.status === 'active' && (
                <>
                  <div className="text-sm mb-3 flex items-center gap-1.5" style={{ color: 'var(--nav-success)' }}>
                    <CheckCircleIcon /> Подключено: {instagramConnection.external_account_name || instagramConnection.channel}
                  </div>
                  <Link href="/ai-agent/review"
                    className="flex items-center justify-center gap-1.5 nav-glass rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                    style={{ color: 'var(--nav-text-primary)' }}>
                    Диалоги на проверке <ArrowRightIcon />
                  </Link>
                </>
              )}
              {instagramConnection?.status === 'token_expired' && (
                // Same sessionExpired-style reconnect banner this codebase
                // already uses in Kaspi Shop -- set by Task 8/9's 401 handling,
                // not guessed at here. Reconnecting reuses the same OAuth flow;
                // Task 7's callback upserts on (channel, external_account_id)
                // and always writes status: 'active', so a successful
                // reconnect clears this automatically.
                <div className="nav-glass rounded-lg p-3 mb-2">
                  <div className="text-sm mb-2 flex items-center gap-1.5" style={{ color: 'var(--nav-critical)' }}>
                    <WarnIcon /> Instagram отключился — переподключите аккаунт, чтобы агент снова отвечал
                  </div>
                  <button onClick={connectInstagram} disabled={connecting}
                    className="w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--nav-critical)', color: '#fff' }}>
                    {connecting ? 'Открываем Instagram…' : 'Переподключить Instagram'}
                  </button>
                </div>
              )}
              {!instagramConnection && (
                <button onClick={connectInstagram} disabled={connecting}
                  className="w-full nav-glass rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
                  {connecting ? 'Открываем Instagram…' : 'Подключить Instagram'}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </main>
    </DesktopShell>
  )
}
