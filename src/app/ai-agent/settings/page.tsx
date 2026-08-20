'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
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
  { value: 'book_appointment', label: 'Записать на консультацию/приём' },
]

// Preset collect-field keys -- mirror COLLECT_FIELD_LABELS in
// src/lib/aiAgent/promptContext.ts (keys must match; labels here are the
// UI-facing capitalized variants). Anything the user adds beyond these is a
// custom free-text field stored verbatim in the same array.
const COLLECT_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'name', label: 'Имя клиента' },
  { value: 'phone', label: 'Номер телефона' },
  { value: 'booking', label: 'Бронирование' },
  { value: 'consultation', label: 'Запись на консультацию' },
  { value: 'address', label: 'Адрес' },
  { value: 'purpose', label: 'Цель обращения' },
  { value: 'budget', label: 'Бюджет' },
  { value: 'timeline', label: 'Желаемые сроки' },
  { value: 'people_count', label: 'Количество человек' },
  { value: 'city', label: 'Город' },
  { value: 'preferences', label: 'Предпочтения' },
  { value: 'past_experience', label: 'Прошлый опыт клиента' },
]

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Almaty', label: 'Asia/Almaty (GMT+5) — Алматы, Астана' },
  { value: 'Asia/Aqtobe', label: 'Asia/Aqtobe (GMT+5) — Актобе' },
  { value: 'Asia/Atyrau', label: 'Asia/Atyrau (GMT+5) — Атырау' },
  { value: 'Asia/Oral', label: 'Asia/Oral (GMT+5) — Уральск' },
  { value: 'Asia/Aqtau', label: 'Asia/Aqtau (GMT+5) — Актау' },
]

const CURRENCY_OPTIONS = [
  { value: 'KZT', label: 'Тенге (₸)' },
  { value: 'USD', label: 'Доллар США ($)' },
  { value: 'EUR', label: 'Евро (€)' },
  { value: 'RUB', label: 'Рубль (₽)' },
]

// How long the "Создаём AI-сотрудника" overlay stays up on FIRST creation.
// The upsert itself is near-instant; the countdown exists to give the
// moment weight (founder: "создает эффект волшебства") and matches the
// reference product's real ~настройка pacing without overstaying.
const CREATE_ANIMATION_MS = 7000

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
  const [collectFields, setCollectFields] = useState<string[]>(['name', 'phone'])
  const [customField, setCustomField] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [timezone, setTimezone] = useState('Asia/Almaty')
  const [currency, setCurrency] = useState('KZT')
  const [creating, setCreating] = useState(false)
  const [createCountdown, setCreateCountdown] = useState(0)
  const createTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
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
    // the URL so a page refresh doesn't keep re-showing the notice. The
    // ?agent= param survives the strip -- it's the multi-agent routing key,
    // not a one-shot notice.
    const params = new URLSearchParams(window.location.search)
    // Multi-agent routing: ?agent=<id> edits that agent, ?new=1 starts a
    // blank form that CREATES on save, no param keeps the legacy behavior
    // (most recent agent, or blank if none). Read via window.location like
    // the notice flags above -- NOT useSearchParams, which would force a
    // Suspense boundary around this whole client page.
    const agentParam = params.get('agent')
    const isNew = params.get('new') === '1'
    if (params.has('instagram_connected')) setOauthNotice('connected')
    else if (params.has('instagram_error')) setOauthNotice('error')
    if (params.has('instagram_connected') || params.has('instagram_error')) {
      window.history.replaceState({}, '', agentParam ? `${window.location.pathname}?agent=${agentParam}` : window.location.pathname)
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
      const res = await fetch(agentParam ? `/api/ai-agent/settings?agentId=${encodeURIComponent(agentParam)}` : '/api/ai-agent/settings', { headers })
      if (res.status === 404) {
        // ?agent= pointing at a deleted/foreign agent -- back to the list.
        router.push('/ai-agent')
        return
      }
      if (res.ok) {
        const data = await res.json()
        // ?new=1 ignores the returned agent (it's just "most recent") and
        // keeps the form blank so save() CREATES -- only the suggested name
        // prefill is taken.
        if (data.agent && !isNew) {
          setAgentId(data.agent.id)
          setName(data.agent.name)
          setTone(data.agent.tone)
          setBusinessDescription(data.agent.businessDescription)
          setGoal(data.agent.goal)
          if (Array.isArray(data.agent.collectFields)) setCollectFields(data.agent.collectFields)
          if (data.agent.timezone) setTimezone(data.agent.timezone)
          if (data.agent.currency) setCurrency(data.agent.currency)
          setConnections(data.connections || [])
        } else {
          setName(data.suggestedName || 'Ассистент')
        }
      }
      setLoading(false)
    }
    load()
  }, [router])

  function toggleCollectField(value: string) {
    setCollectFields(prev => prev.includes(value) ? prev.filter(f => f !== value) : [...prev, value])
  }

  function addCustomField() {
    const trimmed = customField.trim()
    if (!trimmed) return
    if (!collectFields.includes(trimmed)) setCollectFields(prev => [...prev, trimmed])
    setCustomField('')
    setShowCustomInput(false)
  }

  async function save() {
    const isFirstCreation = !agentId
    setSaving(true)

    // First creation gets the full-screen "Создаём AI-сотрудника" moment --
    // the upsert itself is instant, the countdown gives the step weight.
    // Plain re-saves skip it.
    if (isFirstCreation) {
      setCreating(true)
      setCreateCountdown(Math.round(CREATE_ANIMATION_MS / 1000))
      createTimerRef.current = setInterval(() => {
        setCreateCountdown(prev => (prev > 1 ? prev - 1 : 0))
      }, 1000)
    }
    const startedAt = Date.now()

    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/settings', {
      method: 'POST',
      headers,
      // agentId present -> UPDATE that agent; absent -> CREATE a new one.
      body: JSON.stringify({ ...(agentId ? { agentId } : {}), name, tone, businessDescription, goal, collectFields, timezone, currency }),
    })
    if (res.ok) {
      const data = await res.json()
      if (isFirstCreation) {
        const remaining = Math.max(0, CREATE_ANIMATION_MS - (Date.now() - startedAt))
        await new Promise(resolve => setTimeout(resolve, remaining))
      }
      setAgentId(data.agent.id)
      if (isFirstCreation) {
        // Pin the URL to the created agent so a refresh EDITS it instead of
        // re-creating (drops any ?new=1 too). history.replaceState, not
        // router.replace -- router.replace is known-broken for query-only
        // changes in this app (see src/app/create/page.tsx).
        window.history.replaceState({}, '', `/ai-agent/settings?agent=${data.agent.id}`)
      }
    }
    if (createTimerRef.current) { clearInterval(createTimerRef.current); createTimerRef.current = null }
    setCreating(false)
    setSaving(false)
  }

  async function connectInstagram() {
    setConnecting(true)
    setOauthNotice(null)
    try {
      const headers = await authHeader()
      // agentId rides along so the OAuth callback attaches the connection
      // to THIS agent (it travels inside the signed state param).
      const res = await fetch(`/api/ai-agent/instagram/connect${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`, { headers })
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
          <Link href="/ai-agent" className="inline-flex items-center gap-1 text-xs mb-2 transition-colors hover:text-[color:var(--nav-text-secondary)]" style={{ color: 'var(--nav-text-muted)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
            Все агенты
          </Link>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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

          <div className="mb-4">
            <span className="text-xs mb-2 block" style={{ color: 'var(--nav-text-secondary)' }}>Какие данные агент должен собрать у клиента</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-2">
              {COLLECT_FIELD_OPTIONS.map(f => (
                <label key={f.value} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--nav-text-primary)' }}>
                  <input type="checkbox" checked={collectFields.includes(f.value)} onChange={() => toggleCollectField(f.value)}
                    className="accent-[var(--nav-accent)] w-3.5 h-3.5 flex-shrink-0" />
                  {f.label}
                </label>
              ))}
            </div>
            {/* Custom fields the user has added (anything not a preset key) */}
            {collectFields.filter(f => !COLLECT_FIELD_OPTIONS.some(o => o.value === f)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {collectFields.filter(f => !COLLECT_FIELD_OPTIONS.some(o => o.value === f)).map(f => (
                  <button key={f} onClick={() => toggleCollectField(f)}
                    className="text-xs pl-2.5 pr-2 py-1 rounded-full flex items-center gap-1.5"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {f}
                    <span aria-hidden>✕</span>
                  </button>
                ))}
              </div>
            )}
            {showCustomInput ? (
              <div className="flex gap-2">
                <input autoFocus value={customField} maxLength={60}
                  onChange={e => setCustomField(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomField(); if (e.key === 'Escape') { setShowCustomInput(false); setCustomField('') } }}
                  placeholder="Например: размер обуви"
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                  style={{ color: 'var(--nav-text-primary)' }} />
                <button onClick={addCustomField}
                  className="text-xs px-3 py-2 rounded-lg font-semibold flex-shrink-0"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  Добавить
                </button>
              </div>
            ) : (
              <button onClick={() => setShowCustomInput(true)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                ✨ Добавить своё
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <label className="block">
              <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Часовой пояс</span>
              <select value={timezone} onChange={e => setTimezone(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                {TIMEZONE_OPTIONS.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Валюта</span>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                {CURRENCY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </div>

          <button onClick={save} disabled={saving}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
            {saving ? 'Сохраняем…' : agentId ? 'Сохранить' : 'Создать агента'}
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

      {/* First-creation overlay: the "magic" moment. A rotating gradient
          ring (SVG dashoffset spinner, same hand-rolled style as the app's
          charts) + countdown, full-screen over everything. Skipped entirely
          on re-saves and under prefers-reduced-motion the ring is static. */}
      <AnimatePresence>
        {creating && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ background: 'var(--nav-surface-chrome)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4, ease: EASE } }}
          >
            <div className="text-center px-6">
              <motion.svg
                width="72" height="72" viewBox="0 0 72 72" fill="none" className="mx-auto mb-6"
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={reduceMotion ? undefined : { duration: 1.1, repeat: Infinity, ease: 'linear' }}
              >
                <defs>
                  <linearGradient id="aiAgentSpinnerGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--nav-accent)" />
                    <stop offset="100%" stopColor="var(--nav-teal)" />
                  </linearGradient>
                </defs>
                <circle cx="36" cy="36" r="30" stroke="var(--nav-border-soft)" strokeWidth="5" />
                <circle cx="36" cy="36" r="30" stroke="url(#aiAgentSpinnerGradient)" strokeWidth="5"
                  strokeLinecap="round" strokeDasharray="188.5" strokeDashoffset="132" />
              </motion.svg>
              <motion.div
                className="text-lg font-semibold mb-2"
                style={{ color: 'var(--nav-text-primary)' }}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.1 }}
              >
                Создаём AI-сотрудника…
              </motion.div>
              <motion.div
                className="text-sm tabular-nums"
                style={{ color: 'var(--nav-text-muted)' }}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.2 }}
              >
                Агент создастся примерно через 0:{String(createCountdown).padStart(2, '0')}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
    </DesktopShell>
  )
}
