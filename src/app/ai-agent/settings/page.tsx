'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import TestChatPanel from '@/components/aiAgent/TestChatPanel'
import TriggerChipsEditor from '@/components/aiAgent/TriggerChipsEditor'
import FlowBuilder from '@/components/aiAgent/FlowBuilder'
// promptContext is a pure, dependency-free module (no server-only imports,
// no env access) -- safe to bundle client-side, so the Промптинг preview
// shows the REAL assembled context line, not a hand-maintained copy.
import { buildBusinessContextLine, AgentTone, AgentGoal } from '@/lib/aiAgent/promptContext'

const EASE = [0.16, 1, 0.3, 1] as const

// = AI_AGENT_CREDIT_PRICE_TENGE × AI_AGENT_CREDITS_PER_AI_REPLY from
// src/lib/aiAgent/wallet.ts -- not imported: that module (via
// kaspiPay/wallet.ts) constructs a service-role Supabase client at module
// scope, which must never end up in a client bundle. Keep in sync manually.
// Same value/pattern as TestChatPanel.tsx's REPLY_PRICE_TENGE.
const REPLY_PRICE_TENGE = 5

// MoonAI-style tabbed settings (docs/superpowers/mooonai-research-findings.md
// §1) -- tab state lives in ?tab= via history.replaceState (NOT
// router.replace, which is known-broken for query-only changes in this app)
// so a refresh keeps the tab. «Настройки» is the default and ?new=1 always
// lands there.
const TABS = [
  { key: 'settings', label: 'Настройки' },
  { key: 'prompting', label: 'Промптинг' },
  { key: 'control', label: 'Контроль' },
  { key: 'templates', label: 'Шаблоны' },
  { key: 'flows', label: 'Сценарии' },
  { key: 'channels', label: 'Каналы' },
] as const
type TabKey = typeof TABS[number]['key']
const TAB_KEYS: string[] = TABS.map(t => t.key)

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

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

interface ReplyTemplate {
  id: string
  triggerWords: string[]
  replyText: string
  channel: string | null
  createdAt: string
}

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

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.2 6.4a2 2 0 0 0 0-2.8l-.8-.8a2 2 0 0 0-2.8 0L4 16.4 2.9 21l4.7-1L21.2 6.4Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </svg>
  )
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function SiteChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ApiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  )
}

// Same chat-bubble glyph as the «Чат для сайта» channel card (SiteChatIcon
// above) -- reused here for the persistent test-chat trigger and the
// slide-over panel's header, at a size tuned for those spots.
function TestChatBubbleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function StatusChip({ kind, label }: { kind: 'ok' | 'off' | 'soon' | 'warn'; label: string }) {
  const color = kind === 'ok' ? 'var(--nav-success)' : kind === 'warn' ? 'var(--nav-critical)' : 'var(--nav-text-muted)'
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ color, background: 'var(--nav-bg)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, opacity: kind === 'ok' || kind === 'warn' ? 1 : 0.5 }} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}

// MoonAI-style channel card (research §1.9): icon + name + status chip +
// description + action area. Shared shell; each channel supplies its own
// action buttons as children.
function ChannelCard({ icon, name, chip, description, children }: {
  icon: React.ReactNode
  name: string
  chip: React.ReactNode
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="nav-glass nav-card-accent rounded-2xl p-4 flex flex-col">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{name}</div>
          <div className="mt-0.5">{chip}</div>
        </div>
      </div>
      <p className="text-xs mb-3 flex-1" style={{ color: 'var(--nav-text-muted)' }}>{description}</p>
      {children}
    </div>
  )
}

export default function AiAgentSettings() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<TabKey>('settings')
  const [name, setName] = useState('')
  const [tone, setTone] = useState('friendly')
  const [businessDescription, setBusinessDescription] = useState('')
  const [goal, setGoal] = useState('answer_questions')
  const [collectFields, setCollectFields] = useState<string[]>(['name', 'phone'])
  const [customField, setCustomField] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [timezone, setTimezone] = useState('Asia/Almaty')
  const [currency, setCurrency] = useState('KZT')
  const [customInstructions, setCustomInstructions] = useState('')
  const [historyPairs, setHistoryPairs] = useState(5)
  const [isEnabled, setIsEnabled] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createCountdown, setCreateCountdown] = useState(0)
  const createTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [connections, setConnections] = useState<{ channel: string; external_account_name: string | null; status: string }[]>([])
  const [connecting, setConnecting] = useState(false)
  const [igBusy, setIgBusy] = useState(false)
  const [igError, setIgError] = useState<string | null>(null)
  const [telegramToken, setTelegramToken] = useState('')
  const [tgOpen, setTgOpen] = useState(false)
  const [tgBusy, setTgBusy] = useState(false)
  const [tgError, setTgError] = useState<string | null>(null)
  // WhatsApp Embedded Signup (ES v4) -- a JS SDK popup, not a redirect, so
  // its result lands in refs (message-event listener + FB.login callback)
  // rather than a query-param round trip like the Instagram OAuth notice.
  const [waConnecting, setWaConnecting] = useState(false)
  const [waBusy, setWaBusy] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const waPhoneNumberIdRef = useRef<string | null>(null)
  const waWabaIdRef = useRef<string | null>(null)
  const [oauthNotice, setOauthNotice] = useState<'connected' | 'error' | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  // Slide-over test chat (MoonAI-style persistent shortcut) -- visible
  // across all five tabs, so it lives in page-level state rather than any
  // single tab's block. Only openable once the agent has a real id (see
  // openTestChat below) -- a brand-new ?new=1 agent isn't in the DB yet,
  // and the API route this hits does an ownership lookup by id.
  const [testChatOpen, setTestChatOpen] = useState(false)
  // Шаблоны tab state
  const [templates, setTemplates] = useState<ReplyTemplate[]>([])
  const [tplFormOpen, setTplFormOpen] = useState(false)
  const [tplFormWords, setTplFormWords] = useState<string[]>([])
  const [tplFormText, setTplFormText] = useState('')
  const [tplEditId, setTplEditId] = useState<string | null>(null)
  const [tplEditWords, setTplEditWords] = useState<string[]>([])
  const [tplEditText, setTplEditText] = useState('')
  const [tplBusy, setTplBusy] = useState(false)
  const [tplError, setTplError] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  function switchTab(next: TabKey) {
    setTab(next)
    // ?tab= via history.replaceState so refresh keeps the tab; the default
    // «Настройки» keeps the URL clean. ?agent= and other params survive.
    const params = new URLSearchParams(window.location.search)
    if (next === 'settings') params.delete('tab')
    else params.set('tab', next)
    const qs = params.toString()
    window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }

  // Guarded open -- the trigger button is already disabled without an
  // agentId, but this is the actual gate: a brand-new unsaved agent (no id
  // yet) must never open the panel, since TestChatPanel's API call needs a
  // real agentId to look up.
  function openTestChat() {
    if (!agentId) return
    setTestChatOpen(true)
  }

  // Loads Meta's JS SDK once (guarded against double-init across
  // remounts/other pages via a window-level flag, same spirit as the
  // Instagram OAuth notice's one-shot query-param strip). Unlike Instagram's
  // redirect-based OAuth, WhatsApp Embedded Signup is a POPUP the SDK opens
  // via FB.login -- nothing here navigates the page away.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as any
    if (w.FB) return
    if (w.__waFbSdkLoading) return
    w.__waFbSdkLoading = true
    w.fbAsyncInit = function () {
      w.FB.init({
        appId: process.env.NEXT_PUBLIC_WHATSAPP_APP_ID || '',
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v25.0',
      })
    }
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    document.body.appendChild(script)
  }, [])

  // The Embedded Signup popup posts session-logging events here as the user
  // moves through the flow, ending with a 'FINISH' event carrying the
  // phone_number_id/waba_id it just created -- captured into refs so
  // connectWhatsApp's FB.login callback (which arrives separately, carrying
  // the auth `code`) can read them once both are available.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Anchored host check -- a bare endsWith('facebook.com') would also
      // accept e.g. https://evilfacebook.com as a valid origin.
      let originHost: string
      try {
        const o = new URL(event.origin)
        if (o.protocol !== 'https:') return
        originHost = o.hostname
      } catch {
        return
      }
      if (originHost !== 'facebook.com' && !originHost.endsWith('.facebook.com')) return
      let data: any
      try {
        data = JSON.parse(event.data)
      } catch {
        return // the SDK also posts non-JSON messages -- not our concern
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return
      if (data.event === 'FINISH' && data.data) {
        if (data.data.phone_number_id) waPhoneNumberIdRef.current = data.data.phone_number_id
        if (data.data.waba_id) waWabaIdRef.current = data.data.waba_id
      } else if (data.event === 'CANCEL') {
        setWaConnecting(false)
      } else if (data.event === 'ERROR') {
        setWaConnecting(false)
        setWaError('Ошибка при подключении WhatsApp. Попробуйте ещё раз.')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

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
    const hasNotice = params.has('instagram_connected') || params.has('instagram_error')
    if (params.has('instagram_connected')) setOauthNotice('connected')
    else if (params.has('instagram_error')) setOauthNotice('error')

    // Initial tab: ?new=1 always lands on «Настройки»; a fresh OAuth
    // return without an explicit ?tab= opens «Каналы» so the just-connected
    // card is what the user sees.
    const tabParam = params.get('tab')
    if (!isNew) {
      if (tabParam && TAB_KEYS.includes(tabParam)) setTab(tabParam as TabKey)
      else if (hasNotice) setTab('channels')
    }

    if (hasNotice) {
      const clean = new URLSearchParams()
      if (agentParam) clean.set('agent', agentParam)
      if (!isNew) clean.set('tab', tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'channels')
      const qs = clean.toString()
      window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
    }

    async function loadReviewCount(headers: Record<string, string>) {
      // Defensive shape: the review GET is gaining a pendingCount field --
      // fall back to counting items until it ships everywhere.
      try {
        const res = await fetch('/api/ai-agent/review', { headers })
        if (res.ok) {
          const data = await res.json()
          setPendingCount(data.pendingCount ?? data.items?.length ?? 0)
        }
      } catch { /* badge stays 0 -- the link still works */ }
    }

    async function loadTemplates(headers: Record<string, string>, id: string) {
      try {
        const res = await fetch(`/api/ai-agent/templates?agentId=${encodeURIComponent(id)}`, { headers })
        if (res.ok) {
          const data = await res.json()
          setTemplates(Array.isArray(data.templates) ? data.templates : [])
        }
      } catch { /* empty list -- tab shows its empty state */ }
    }

    // Balance is per-user, not per-agent -- fetched regardless of whether an
    // agent exists yet, unlike loadReviewCount/loadTemplates above.
    async function loadWalletBalance(headers: Record<string, string>) {
      try {
        const res = await fetch('/api/ai-agent/wallet', { headers })
        if (res.ok) {
          const data = await res.json()
          if (typeof data.balance === 'number') setWalletBalance(data.balance)
        }
      } catch { /* card just hides the estimate line */ }
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
      loadWalletBalance(headers)
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
          if (typeof data.agent.customInstructions === 'string') setCustomInstructions(data.agent.customInstructions)
          if (typeof data.agent.historyPairs === 'number') setHistoryPairs(data.agent.historyPairs)
          if (typeof data.agent.isEnabled === 'boolean') setIsEnabled(data.agent.isEnabled)
          setConnections(data.connections || [])
          // Secondary data (badge count + saved templates) loads in the
          // background -- neither should hold up first paint of the form.
          loadReviewCount(headers)
          loadTemplates(headers, data.agent.id)
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

  // One save() shared by every tab's Сохранить button -- the whole form is
  // a single agent row, whichever tab the visible field lives on.
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
      body: JSON.stringify({ ...(agentId ? { agentId } : {}), name, tone, businessDescription, goal, collectFields, timezone, currency, customInstructions, historyPairs, isEnabled }),
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

  async function disconnectInstagram() {
    if (!agentId) return
    if (!window.confirm('Отключить Instagram? Агент перестанет отвечать клиентам в этом аккаунте.')) return
    setIgBusy(true)
    setIgError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/instagram/disconnect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.channel !== 'instagram'))
        setOauthNotice(null)
      } else {
        setIgError('Не удалось отключить Instagram. Попробуйте ещё раз.')
      }
    } catch {
      setIgError('Не удалось отключить Instagram. Попробуйте ещё раз.')
    }
    setIgBusy(false)
  }

  // No OAuth dance for Telegram -- the pasted BotFather token IS the
  // credential, so connect is a plain authorized POST and the result can be
  // reflected in local state immediately (no redirect round-trip).
  async function connectTelegram() {
    const token = telegramToken.trim()
    if (!token || !agentId) return
    setTgBusy(true)
    setTgError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/telegram/connect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ agentId, botToken: token }),
      })
      if (res.ok) {
        const data = await res.json()
        setConnections(prev => [...prev.filter(c => c.channel !== 'telegram'), { channel: 'telegram', external_account_name: data.botUsername, status: 'active' }])
        setTelegramToken('')
        setTgOpen(false)
      } else {
        const data = await res.json().catch(() => null)
        setTgError(data?.error === 'invalid_token'
          ? 'Токен не подошёл — проверьте, что скопировали его из @BotFather целиком.'
          : 'Не удалось подключить Telegram. Попробуйте ещё раз — если не получится снова, напишите в поддержку.')
      }
    } catch {
      setTgError('Не удалось подключить Telegram. Попробуйте ещё раз — если не получится снова, напишите в поддержку.')
    }
    setTgBusy(false)
  }

  async function disconnectTelegram() {
    if (!agentId) return
    setTgBusy(true)
    setTgError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/telegram/connect', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.channel !== 'telegram'))
      } else {
        setTgError('Не удалось отключить Telegram. Попробуйте ещё раз.')
      }
    } catch {
      setTgError('Не удалось отключить Telegram. Попробуйте ещё раз.')
    }
    setTgBusy(false)
  }

  // WhatsApp Embedded Signup: FB.login opens the popup; its callback fires
  // once the popup closes, carrying an auth `code`. The phone_number_id and
  // waba_id the user just created arrive separately via the message-event
  // listener above, usually slightly BEFORE the callback -- so a short poll
  // covers the rare race where the callback resolves first.
  async function connectWhatsApp() {
    if (!agentId) return
    const FB = (window as any).FB
    if (!FB) {
      setWaError('WhatsApp SDK ещё загружается — подождите секунду и попробуйте снова.')
      return
    }
    setWaError(null)
    setWaConnecting(true)
    waPhoneNumberIdRef.current = null
    waWabaIdRef.current = null

    FB.login((response: any) => {
      const code = response?.authResponse?.code
      if (!code) {
        // Popup closed without completing the flow -- not necessarily an
        // error (user may have just backed out), so no error banner.
        setWaConnecting(false)
        return
      }
      ;(async () => {
        let attempts = 0
        while ((!waPhoneNumberIdRef.current || !waWabaIdRef.current) && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 150))
          attempts++
        }
        if (!waPhoneNumberIdRef.current || !waWabaIdRef.current) {
          setWaConnecting(false)
          setWaError('Не удалось получить данные номера WhatsApp. Попробуйте ещё раз.')
          return
        }
        try {
          const headers = await authHeader()
          const res = await fetch('/api/ai-agent/whatsapp/callback', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              agentId,
              code,
              phoneNumberId: waPhoneNumberIdRef.current,
              wabaId: waWabaIdRef.current,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            setConnections(prev => [...prev.filter(c => c.channel !== 'whatsapp'), { channel: 'whatsapp', external_account_name: data.displayPhoneNumber || null, status: 'active' }])
          } else {
            setWaError('Не удалось подключить WhatsApp. Попробуйте ещё раз — если не получится снова, напишите в поддержку.')
          }
        } catch {
          setWaError('Не удалось подключить WhatsApp. Попробуйте ещё раз — если не получится снова, напишите в поддержку.')
        }
        setWaConnecting(false)
      })()
    }, {
      config_id: process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || '',
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {} },
    })
  }

  async function disconnectWhatsApp() {
    if (!agentId) return
    if (!window.confirm('Отключить WhatsApp? Агент перестанет отвечать клиентам в этом номере.')) return
    setWaBusy(true)
    setWaError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/whatsapp/disconnect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.channel !== 'whatsapp'))
      } else {
        setWaError('Не удалось отключить WhatsApp. Попробуйте ещё раз.')
      }
    } catch {
      setWaError('Не удалось отключить WhatsApp. Попробуйте ещё раз.')
    }
    setWaBusy(false)
  }

  async function createTemplate() {
    if (!agentId || tplFormWords.length === 0 || !tplFormText.trim()) return
    setTplBusy(true)
    setTplError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/templates', {
        method: 'POST',
        headers,
        body: JSON.stringify({ agentId, triggerWords: tplFormWords, replyText: tplFormText.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(prev => [...prev, data.template])
        setTplFormOpen(false)
        setTplFormWords([])
        setTplFormText('')
      } else {
        setTplError('Не удалось сохранить шаблон. Попробуйте ещё раз.')
      }
    } catch {
      setTplError('Не удалось сохранить шаблон. Попробуйте ещё раз.')
    }
    setTplBusy(false)
  }

  function startEditTemplate(t: ReplyTemplate) {
    setTplEditId(t.id)
    setTplEditWords(t.triggerWords)
    setTplEditText(t.replyText)
    setTplError(null)
  }

  async function saveEditTemplate() {
    if (!tplEditId || tplEditWords.length === 0 || !tplEditText.trim()) return
    setTplBusy(true)
    setTplError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/templates', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: tplEditId, triggerWords: tplEditWords, replyText: tplEditText.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(prev => prev.map(t => t.id === data.template.id ? data.template : t))
        setTplEditId(null)
      } else {
        setTplError('Не удалось сохранить изменения. Попробуйте ещё раз.')
      }
    } catch {
      setTplError('Не удалось сохранить изменения. Попробуйте ещё раз.')
    }
    setTplBusy(false)
  }

  async function removeTemplate(id: string) {
    if (!window.confirm('Удалить шаблон? Агент перестанет отвечать им автоматически.')) return
    setTplBusy(true)
    setTplError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/templates', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id))
        if (tplEditId === id) setTplEditId(null)
      } else {
        setTplError('Не удалось удалить шаблон. Попробуйте ещё раз.')
      }
    } catch {
      setTplError('Не удалось удалить шаблон. Попробуйте ещё раз.')
    }
    setTplBusy(false)
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
  const telegramConnection = connections.find(c => c.channel === 'telegram')
  const whatsappConnection = connections.find(c => c.channel === 'whatsapp')
  const tgExpanded = tgOpen || telegramConnection?.status === 'token_expired'

  // The real server-side context line, assembled from the same visible
  // field values (promptContext is pure/portable). Labeled «примерный»
  // because the live prompt wraps additional system text around this line.
  const promptPreview = buildBusinessContextLine({
    name: name.trim() || 'Ваш бизнес',
    tone: tone as AgentTone,
    description: businessDescription,
    goal: goal as AgentGoal,
    collectFields,
    timezone,
    currency,
    customInstructions,
  })

  const saveButton = (
    <button onClick={save} disabled={saving}
      className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
      {saving ? 'Сохраняем…' : agentId ? 'Сохранить' : 'Создать агента'}
    </button>
  )

  const needsAgentHint = (text: string) => (
    <div className="nav-glass nav-card-accent rounded-2xl p-5 text-sm text-center" style={{ color: 'var(--nav-text-muted)' }}>
      {text}{' '}
      <button onClick={() => switchTab('settings')} className="font-medium underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
        Перейти к настройкам
      </button>
    </div>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-2xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="flex items-start justify-between gap-3 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <Link href="/ai-agent" className="inline-flex items-center gap-1 text-xs mb-2 transition-colors hover:text-[color:var(--nav-text-secondary)]" style={{ color: 'var(--nav-text-muted)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
              Все агенты
            </Link>
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>AI-агент</h1>
            <p className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>Настройте ассистента, который отвечает вашим клиентам в Instagram и Telegram</p>
          </div>
          {/* Persistent across all five tabs (MoonAI-style shortcut) --
              disabled with a tooltip until the agent has a real id: a
              ?new=1 agent isn't in the DB yet, so there's nothing for the
              test-chat API to look up. */}
          <button
            onClick={openTestChat}
            disabled={!agentId}
            title={agentId ? undefined : 'Сохраните агента, чтобы протестировать'}
            className="flex items-center gap-1.5 nav-glass rounded-lg px-3 py-2 text-sm font-medium flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-[color:var(--nav-bg)]"
            style={{ color: 'var(--nav-text-primary)' }}
          >
            <TestChatBubbleIcon /> Тестовый чат
          </button>
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

        {/* MoonAI-style horizontal tab bar (research §1): pill tabs, active
            state on --nav-accent, layoutId slide between tabs. */}
        <motion.div
          className="nav-glass rounded-xl p-1 mb-5 flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Разделы настроек агента"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.04 }}
        >
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} role="tab" aria-selected={active} onClick={() => switchTab(t.key)}
                className="relative flex-shrink-0 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors"
                style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                {active && (
                  <motion.span
                    layoutId="aiAgentSettingsTabPill"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: 'var(--nav-accent)' }}
                    transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
                  />
                )}
                <span className="relative z-[1]">{t.label}</span>
              </button>
            )
          })}
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6, transition: { duration: 0.15, ease: EASE } }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
          >
            {tab === 'settings' && (
              <div className="nav-glass nav-card-accent rounded-2xl p-5">
                <label className="block mb-4">
                  <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Название компании</span>
                  <input
                    className={INPUT_CLS}
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
                    className={`${INPUT_CLS} min-h-[100px]`}
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
                        className={`flex-1 ${INPUT_CLS}`}
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
                      className={INPUT_CLS}
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                      {TIMEZONE_OPTIONS.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Валюта</span>
                    <select value={currency} onChange={e => setCurrency(e.target.value)}
                      className={INPUT_CLS}
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                      {CURRENCY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                </div>

                {saveButton}
              </div>
            )}

            {tab === 'prompting' && (
              <>
                <div className="nav-glass nav-card-accent rounded-2xl p-5">
                  <label className="block mb-6">
                    <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Дополнительные инструкции (необязательно)</span>
                    <textarea
                      className={`${INPUT_CLS} min-h-[120px]`}
                      style={{ color: 'var(--nav-text-primary)' }}
                      maxLength={2000}
                      placeholder="Например: не обещай скидки; доставка только по Алматы; рабочие часы 9:00–18:00"
                      value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} />
                    <span className="text-[11px] mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>
                      Агент будет следовать этим правилам в каждом ответе.
                    </span>
                  </label>
                  {saveButton}
                </div>

                <div className="nav-glass nav-card-accent rounded-2xl p-5 mt-4">
                  <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Как агент видит инструкции</div>
                  <p className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                    Примерный вид инструкций агента — собирается из полей выше; в реальном ответе к этой строке добавляется системный текст.
                  </p>
                  <div className="rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                    {promptPreview}
                  </div>
                </div>
              </>
            )}

            {tab === 'control' && (
              <div className="nav-glass nav-card-accent rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <div>
                    <span className="text-sm font-semibold block" style={{ color: 'var(--nav-text-primary)' }}>Статус бота</span>
                    <span className="text-[11px] block mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>
                      Выключенный агент не отвечает клиентам.
                    </span>
                  </div>
                  <button role="switch" aria-checked={isEnabled} aria-label="Статус бота"
                    onClick={() => setIsEnabled(v => !v)}
                    className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5"
                    style={{ background: isEnabled ? 'var(--nav-accent)' : 'var(--nav-border)' }}>
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: isEnabled ? '18px' : '2px' }} />
                  </button>
                </div>

                <div className="my-5" style={{ borderTop: '1px solid var(--nav-border-soft)' }} />

                <label className="block mb-6">
                  <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Глубина памяти диалога</span>
                  <select value={historyPairs} onChange={e => setHistoryPairs(Number(e.target.value))}
                    className={INPUT_CLS}
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                    {[3, 5, 8, 10].map(n => <option key={n} value={n}>Последние {n} обменов</option>)}
                  </select>
                  <span className="text-[11px] mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>
                    Сколько прошлых сообщений агент помнит. Больше — точнее контекст, но дороже каждый ответ.
                  </span>
                </label>

                {saveButton}
              </div>
            )}

            {tab === 'control' && (
              <div className="nav-glass nav-card-accent rounded-2xl p-5 mt-4">
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Стоимость ИИ-ответов</div>
                <p className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                  Ответ по совпадению с шаблоном — бесплатно. Ответ, который сгенерировал ИИ — {REPLY_PRICE_TENGE} ₸.
                </p>
                {walletBalance !== null && (
                  <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                    Баланс кошелька: <b style={{ color: 'var(--nav-text-primary)' }}>{walletBalance.toLocaleString('ru-KZ')} ₸</b>
                    {' '}— хватит примерно на <b style={{ color: 'var(--nav-text-primary)' }}>{Math.max(0, Math.floor(walletBalance / REPLY_PRICE_TENGE)).toLocaleString('ru-KZ')}</b> ИИ-ответов.
                    <span className="block mt-1" style={{ color: 'var(--nav-text-muted)' }}>Кошелёк общий для Счетов, Kaspi Bot и AI-агента — пополнить можно значком кошелька в правом верхнем углу.</span>
                  </div>
                )}
              </div>
            )}

            {tab === 'templates' && (
              !agentId ? needsAgentHint('Шаблоны появятся после создания агента.') : (
                <div>
                  <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                    Шаблоны отвечают мгновенно и бесплатно — если сообщение клиента содержит триггер, ИИ не вызывается.
                  </p>

                  {templates.length === 0 && !tplFormOpen && (
                    <div className="nav-glass nav-card-accent rounded-2xl p-5 text-sm text-center mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                      Шаблонов пока нет. Они создаются автоматически, когда вы одобряете ответы в «Диалогах на проверке», — и их можно добавить вручную.
                    </div>
                  )}

                  <div className="space-y-3">
                    {templates.map(t => (
                      <div key={t.id} className="nav-glass nav-card-accent rounded-2xl p-4">
                        {tplEditId === t.id ? (
                          <div>
                            <span className="text-xs mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>Триггерные слова</span>
                            <TriggerChipsEditor words={tplEditWords} onChange={setTplEditWords} />
                            <span className="text-xs mt-3 mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>Текст ответа</span>
                            <textarea
                              className={`${INPUT_CLS} min-h-[80px]`}
                              style={{ color: 'var(--nav-text-primary)' }}
                              maxLength={2000}
                              value={tplEditText} onChange={e => setTplEditText(e.target.value)} />
                            <div className="flex gap-2 mt-3">
                              <button onClick={saveEditTemplate} disabled={tplBusy || tplEditWords.length === 0 || !tplEditText.trim()}
                                className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                                {tplBusy ? 'Сохраняем…' : 'Сохранить'}
                              </button>
                              <button onClick={() => setTplEditId(null)} disabled={tplBusy}
                                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                                style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex flex-wrap gap-1.5 min-w-0">
                                {t.triggerWords.map(w => (
                                  <span key={w} className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                                    {w}
                                  </span>
                                ))}
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <button onClick={() => startEditTemplate(t)} aria-label="Редактировать шаблон"
                                  className="p-1.5 rounded-lg transition-colors hover:text-[color:var(--nav-accent)]"
                                  style={{ color: 'var(--nav-text-muted)' }}>
                                  <PencilIcon />
                                </button>
                                <button onClick={() => removeTemplate(t.id)} disabled={tplBusy} aria-label="Удалить шаблон"
                                  className="p-1.5 rounded-lg transition-colors hover:text-[color:var(--nav-critical)] disabled:opacity-50"
                                  style={{ color: 'var(--nav-text-muted)' }}>
                                  <TrashIcon />
                                </button>
                              </div>
                            </div>
                            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--nav-text-primary)' }}>{t.replyText}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {tplFormOpen ? (
                    <div className="nav-glass nav-card-accent rounded-2xl p-4 mt-3">
                      <span className="text-xs mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>Триггерные слова</span>
                      <TriggerChipsEditor words={tplFormWords} onChange={setTplFormWords} />
                      <span className="text-xs mt-3 mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>Текст ответа</span>
                      <textarea
                        className={`${INPUT_CLS} min-h-[80px]`}
                        style={{ color: 'var(--nav-text-primary)' }}
                        maxLength={2000}
                        placeholder="Ответ, который клиент получит мгновенно"
                        value={tplFormText} onChange={e => setTplFormText(e.target.value)} />
                      <div className="flex gap-2 mt-3">
                        <button onClick={createTemplate} disabled={tplBusy || tplFormWords.length === 0 || !tplFormText.trim()}
                          className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                          {tplBusy ? 'Сохраняем…' : 'Добавить'}
                        </button>
                        <button onClick={() => { setTplFormOpen(false); setTplFormWords([]); setTplFormText('') }} disabled={tplBusy}
                          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                          style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setTplFormOpen(true); setTplError(null) }}
                      className="w-full nav-glass rounded-2xl px-4 py-3 text-sm font-medium mt-3 transition-transform hover:-translate-y-0.5"
                      style={{ color: 'var(--nav-accent)' }}>
                      + Добавить шаблон
                    </button>
                  )}

                  {tplError && (
                    <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{tplError}</div>
                  )}
                </div>
              )
            )}

            {tab === 'flows' && (
              !agentId ? needsAgentHint('Сценарии появятся после создания агента.') : (
                <FlowBuilder agentId={agentId} authHeader={authHeader} />
              )
            )}

            {tab === 'channels' && (
              !agentId ? needsAgentHint('Каналы можно подключить после создания агента.') : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ChannelCard
                    icon={<InstagramIcon />}
                    name="Instagram"
                    chip={instagramConnection?.status === 'active'
                      ? <StatusChip kind="ok" label={`Подключено: ${instagramConnection.external_account_name || 'аккаунт'}`} />
                      : instagramConnection?.status === 'token_expired'
                        ? <StatusChip kind="warn" label="Требуется переподключение" />
                        : <StatusChip kind="off" label="Не подключен" />}
                    description="Агент отвечает на комментарии и сообщения в Директ вашего бизнес-аккаунта"
                  >
                    {instagramConnection?.status === 'active' && (
                      <button onClick={disconnectInstagram} disabled={igBusy}
                        className="w-full nav-glass rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                        style={{ color: 'var(--nav-text-primary)' }}>
                        {igBusy ? 'Отключаем…' : 'Отключить'}
                      </button>
                    )}
                    {instagramConnection?.status === 'token_expired' && (
                      <>
                        <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--nav-critical)' }}>
                          <WarnIcon /> Instagram отключился — переподключите аккаунт, чтобы агент снова отвечал
                        </div>
                        <button onClick={connectInstagram} disabled={connecting}
                          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                          style={{ background: 'var(--nav-critical)', color: '#fff' }}>
                          {connecting ? 'Открываем Instagram…' : 'Переподключить'}
                        </button>
                      </>
                    )}
                    {!instagramConnection && (
                      <button onClick={connectInstagram} disabled={connecting}
                        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        {connecting ? 'Открываем Instagram…' : 'Подключить'}
                      </button>
                    )}
                    {igError && (
                      <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{igError}</div>
                    )}
                  </ChannelCard>

                  <ChannelCard
                    icon={<TelegramIcon />}
                    name="Telegram-бот"
                    chip={telegramConnection?.status === 'active'
                      ? <StatusChip kind="ok" label={`Подключено: @${telegramConnection.external_account_name || 'бот'}`} />
                      : telegramConnection?.status === 'token_expired'
                        ? <StatusChip kind="warn" label="Требуется переподключение" />
                        : <StatusChip kind="off" label="Не подключен" />}
                    description="Агент отвечает на сообщения в вашем Telegram-боте, созданном через @BotFather"
                  >
                    {telegramConnection?.status === 'active' ? (
                      <button onClick={disconnectTelegram} disabled={tgBusy}
                        className="w-full nav-glass rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                        style={{ color: 'var(--nav-text-primary)' }}>
                        {tgBusy ? 'Отключаем…' : 'Отключить'}
                      </button>
                    ) : tgExpanded ? (
                      <>
                        {telegramConnection?.status === 'token_expired' && (
                          <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--nav-critical)' }}>
                            <WarnIcon /> Telegram-бот отключился — вставьте токен ещё раз, чтобы агент снова отвечал
                          </div>
                        )}
                        <p className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
                          Создайте бота через @BotFather и вставьте токен — агент начнёт отвечать на сообщения в этом боте
                        </p>
                        <input
                          className={`${INPUT_CLS} mb-2`}
                          style={{ color: 'var(--nav-text-primary)' }}
                          placeholder="123456789:AAH3xk…"
                          autoComplete="off"
                          value={telegramToken}
                          onChange={e => setTelegramToken(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') connectTelegram() }} />
                        <div className="flex gap-2">
                          <button onClick={connectTelegram} disabled={tgBusy || !telegramToken.trim()}
                            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                            {tgBusy ? 'Подключаем…' : 'Подключить'}
                          </button>
                          {telegramConnection?.status !== 'token_expired' && (
                            <button onClick={() => { setTgOpen(false); setTgError(null) }} disabled={tgBusy}
                              className="rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-50"
                              style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                              Отмена
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <button onClick={() => setTgOpen(true)}
                        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
                        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        Подключить
                      </button>
                    )}
                    {tgError && (
                      <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{tgError}</div>
                    )}
                  </ChannelCard>

                  <ChannelCard
                    icon={<WhatsAppIcon />}
                    name="WhatsApp"
                    chip={whatsappConnection?.status === 'active'
                      ? <StatusChip kind="ok" label={`Подключено: ${whatsappConnection.external_account_name || 'номер'}`} />
                      : whatsappConnection?.status === 'token_expired'
                        ? <StatusChip kind="warn" label="Требуется переподключение" />
                        : <StatusChip kind="off" label="Не подключен" />}
                    description="Агент отвечает на сообщения в вашем WhatsApp Business — официальный WhatsApp Cloud API"
                  >
                    {whatsappConnection?.status === 'active' && (
                      <button onClick={disconnectWhatsApp} disabled={waBusy}
                        className="w-full nav-glass rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                        style={{ color: 'var(--nav-text-primary)' }}>
                        {waBusy ? 'Отключаем…' : 'Отключить'}
                      </button>
                    )}
                    {whatsappConnection?.status === 'token_expired' && (
                      <>
                        <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--nav-critical)' }}>
                          <WarnIcon /> WhatsApp отключился — переподключите номер, чтобы агент снова отвечал
                        </div>
                        <button onClick={connectWhatsApp} disabled={waConnecting}
                          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                          style={{ background: 'var(--nav-critical)', color: '#fff' }}>
                          {waConnecting ? 'Открываем WhatsApp…' : 'Переподключить'}
                        </button>
                      </>
                    )}
                    {!whatsappConnection && (
                      <button onClick={connectWhatsApp} disabled={waConnecting}
                        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        {waConnecting ? 'Подключаем…' : 'Подключить'}
                      </button>
                    )}
                    {waError && (
                      <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{waError}</div>
                    )}
                  </ChannelCard>

                  <ChannelCard
                    icon={<SiteChatIcon />}
                    name="Чат для сайта"
                    chip={<StatusChip kind="soon" label="Скоро" />}
                    description="Виджет чата на вашем сайте — агент отвечает посетителям в реальном времени"
                  >
                    <button disabled className="w-full nav-glass rounded-lg px-4 py-2.5 text-sm font-medium opacity-50 cursor-not-allowed" style={{ color: 'var(--nav-text-primary)' }}>
                      Подключить
                    </button>
                  </ChannelCard>

                  <ChannelCard
                    icon={<ApiIcon />}
                    name="API"
                    chip={<StatusChip kind="soon" label="Скоро" />}
                    description="Подключите свою систему — CRM, сайт или приложение — через HTTP API"
                  >
                    <button disabled className="w-full nav-glass rounded-lg px-4 py-2.5 text-sm font-medium opacity-50 cursor-not-allowed" style={{ color: 'var(--nav-text-primary)' }}>
                      Подключить
                    </button>
                  </ChannelCard>
                </div>
              )
            )}
          </motion.div>
        </AnimatePresence>

        {/* Review-queue link -- pinned below every tab's content, with the
            live pending-draft count. Only meaningful once an agent exists. */}
        {agentId && (
          <motion.div
            className="mt-4"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE, delay: reduceMotion ? 0 : 0.08 }}
          >
            <Link href="/ai-agent/review"
              className="nav-glass nav-card-accent rounded-2xl px-4 py-3.5 flex items-center justify-between transition-transform hover:-translate-y-0.5">
              <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>
                Диалоги на проверке
                {pendingCount > 0 && (
                  <span className="text-[11px] font-bold px-1.5 min-w-[20px] h-5 rounded-full inline-flex items-center justify-center"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {pendingCount}
                  </span>
                )}
              </span>
              <span style={{ color: 'var(--nav-text-muted)' }}><ArrowRightIcon /></span>
            </Link>
          </motion.div>
        )}
      </div>

      {/* Slide-over test chat -- MoonAI-style persistent shortcut so the
          founder can try a reply without leaving settings. Backdrop click
          closes it; the panel itself stops that click from bubbling.
          Scoped to whichever agent is currently being edited -- agentId is
          re-read from page state, not re-derived. Guarded again here (not
          just at the trigger button) so a stale open state can never
          render TestChatPanel without a real id. */}
      <AnimatePresence>
        {testChatOpen && agentId && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE } }}
            onClick={() => setTestChatOpen(false)}
          >
            <motion.div
              className="nav-glass fixed right-0 top-0 bottom-0 w-full max-w-md flex flex-col"
              initial={reduceMotion ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: '100%', transition: { duration: 0.28, ease: EASE } }}
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE }}
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Тестовый чат"
            >
              <div className="flex items-center justify-between gap-3 px-4 lg:px-5 py-4 border-b border-[color:var(--nav-border)] flex-shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                    <TestChatBubbleIcon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>Тестовый чат</div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--nav-text-muted)' }}>{name.trim() || 'Ваш агент'}</div>
                  </div>
                </div>
                <button onClick={() => setTestChatOpen(false)} aria-label="Закрыть"
                  className="p-1.5 rounded-lg flex-shrink-0 transition-colors hover:bg-[color:var(--nav-bg)]"
                  style={{ color: 'var(--nav-text-muted)' }}>
                  <CloseIcon />
                </button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col p-3 lg:p-4">
                <TestChatPanel agentId={agentId} fill />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
