'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import AiAgentProUpsell from '@/components/aiAgent/AiAgentProUpsell'
import DesktopShell from '@/components/DesktopShell'
import TestChatPanel from '@/components/aiAgent/TestChatPanel'
import ChannelCards, { ChannelCard, StatusChip, ApiIcon, ensureFacebookSdk, type AgentConnection } from '@/components/aiAgent/ChannelCards'
import WhatsAppUsage from '@/components/aiAgent/WhatsAppUsage'
import { canUseSetupWizard } from '@/lib/aiAgent/setupWizard'
import TriggerChipsEditor from '@/components/aiAgent/TriggerChipsEditor'
import FlowBuilder from '@/components/aiAgent/FlowBuilder'
import { getActivePlan } from '@/lib/plan'
import { useLanguage } from '@/components/LanguageProvider'
import { aiAgentDict, type AiAgentDict } from '@/lib/i18n/aiAgent'
import { aiAgentFormsDict } from '@/lib/i18n/aiAgentForms'
import { TRAINING_MESSAGE_THRESHOLD, TRAINING_DAYS_THRESHOLD, trainingDaysLeft } from '@/lib/aiAgent/trainingStatus'
import { settingsSaveErrorKind, isBlankAgentName, type SettingsSaveErrorKind } from '@/lib/aiAgent/settingsSaveError'
// promptContext is a pure, dependency-free module (no server-only imports,
// no env access) -- safe to bundle client-side, so the Промптинг preview
// shows the REAL assembled context line, not a hand-maintained copy.
import { buildBusinessContextLine, AgentTone, AgentGoal } from '@/lib/aiAgent/promptContext'
import { useAppDialog } from '@/components/AppDialog'
import { useCrossHref } from '@/lib/useCrossHref'

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
// Labels come from the dictionary at render time (src/lib/i18n/aiAgent.ts);
// only the keys are structural.
const TABS = [
  { key: 'settings' },
  { key: 'prompting' },
  { key: 'control' },
  { key: 'templates' },
  { key: 'flows' },
  { key: 'channels' },
] as const

const tabLabel = (t: AiAgentDict, key: string): string =>
  key === 'prompting' ? t.tabPrompting
  : key === 'control' ? t.tabControl
  : key === 'templates' ? t.tabTemplates
  : key === 'flows' ? t.tabFlows
  : key === 'channels' ? t.tabChannels
  : t.tabSettings
type TabKey = typeof TABS[number]['key']
const TAB_KEYS: string[] = TABS.map(t => t.key)

// These lists hold only the values stored in the database. Their labels live in
// src/lib/i18n/aiAgentForms.ts, keyed by the same value, so a language switch
// changes what the option reads without changing what gets saved.
const TONE_VALUES = ['friendly', 'professional', 'energetic', 'caring']

const GOAL_VALUES = ['answer_questions', 'qualify_lead', 'book_appointment']

// Preset collect-field keys -- mirror COLLECT_FIELD_LABELS in
// src/lib/aiAgent/promptContext.ts (keys must match). Anything the user adds
// beyond these is a custom free-text field stored verbatim in the same array.
const COLLECT_FIELD_VALUES: string[] = [
  'name', 'phone', 'booking', 'consultation', 'address', 'purpose',
  'budget', 'timeline', 'people_count', 'city', 'preferences', 'past_experience',
]

// The GMT offset is the same for all five and is not translated; only the city
// list after the dash is.
const TIMEZONE_VALUES = ['Asia/Almaty', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Aqtau']

const CURRENCY_VALUES = ['KZT', 'USD', 'EUR', 'RUB']

// Создание агента мгновенное (15.10.2026): 7-секундный оверлей с обратным
// отсчётом (CREATE_ANIMATION_MS) убран -- запись в базу занимает доли
// секунды, а ожидание только задерживало переход к каналу, без которого
// агент не отвечает. После создания страница сама открывает «Каналы».

// Сколько держится строка «Сохранено» под кнопкой и у тумблера.
const SAVED_FLASH_MS = 2500

// Значение пункта «Не использовать магазин Kaspi» в выборе магазина (не id).
const KASPI_OFF_VALUE = '__off__'
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

// Same chat-bubble glyph as the «Чат для сайта» channel card (SiteChatIcon
// in ChannelCards.tsx) -- reused here for the persistent test-chat trigger and the
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

export default function AiAgentSettings() {
  const crossHref = useCrossHref()
  const { lang } = useLanguage()
  const t = aiAgentDict[lang]
  // Shadows window.alert / window.confirm for this component -- see
  // src/components/AppDialog.tsx. Every confirm below is awaited: a Promise
  // is truthy, so `if (confirm(...))` would silently pass.
  const { alert, confirm, dialogElement } = useAppDialog()
  const tf = aiAgentFormsDict[lang]
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
  const [stopPhrases, setStopPhrases] = useState<string[]>(['оператор', 'человек', 'менеджер', 'позовите', 'поговорить с человеком'])
  const [historyPairs, setHistoryPairs] = useState(5)
  // Which Kaspi Shop store this agent quotes prices from. '' = follow the
  // account's active store, which is what every agent did before this was
  // selectable -- an account with two stores gave both its agents whichever
  // one happened to be active in the Kaspi Bot section.
  const [kaspiShopConnectionId, setKaspiShopConnectionId] = useState('')
  const [kaspiShops, setKaspiShops] = useState<{ id: string; name: string; isActive: boolean }[]>([])
  // «Не использовать магазин Kaspi»: агент не называет товары и цены вовсе
  // (ai_agents.kaspi_catalog_off). kaspiCatalogSupported -- миграция с этой
  // колонкой применена; без неё опцию не показываем и флаг не шлём.
  const [kaspiCatalogOff, setKaspiCatalogOff] = useState(false)
  const [kaspiCatalogSupported, setKaspiCatalogSupported] = useState(false)
  const [metaPixelId, setMetaPixelId] = useState<string | null>(null)
  const [metaPixelIdInput, setMetaPixelIdInput] = useState('')
  const [metaTokenInput, setMetaTokenInput] = useState('')
  const [metaCapiBusy, setMetaCapiBusy] = useState(false)
  const [metaCapiError, setMetaCapiError] = useState<string | null>(null)
  const [isEnabled, setIsEnabled] = useState(true)
  // Training mode queues every reply instead of sending it. The API has
  // always returned this status and the page has always ignored it.
  const [agentStatus, setAgentStatus] = useState('')
  const [trainingCount, setTrainingCount] = useState(0)
  // Первый черновик на проверке (null -- ещё не было, отсчёт дней не начался)
  // и «срок вышел, агент начнёт отвечать сам со следующего сообщения».
  const [trainingFirstDraftAt, setTrainingFirstDraftAt] = useState<string | null>(null)
  const [trainingExitPending, setTrainingExitPending] = useState(false)
  // Итог последнего «Сохранить»: ошибка сервера показывается словами
  // (раньше !res.ok молча проглатывался), успех -- короткое «Сохранено».
  const [saveError, setSaveError] = useState<SettingsSaveErrorKind | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Тумблер «Статус бота» сохраняется сразу (PATCH /api/ai-agent/agents/[id]),
  // при ошибке откатывается назад.
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState(false)
  const [statusSaved, setStatusSaved] = useState(false)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Только что созданный агент: один раз докрутить к подсказке на «Каналах».
  // Флаг в ref, а прокрутка -- в callback ref самой подсказки: вкладки
  // меняются через AnimatePresence mode="wait", и «Каналы» монтируются только
  // после анимации ухода старой вкладки, так что эффект на [tab] срабатывал,
  // когда подсказки в DOM ещё не было.
  const scrollToChannelHintRef = useRef(false)
  // Защита от гонки тумблера «Статус бота» (PATCH) и «Сохранить» (POST):
  // пока идёт одно, второе не запускается. Ref, а не только state, чтобы
  // проверка не зависела от того, успел ли React перерисовать кнопку.
  const savingRef = useRef(false)
  const statusBusyRef = useRef(false)
  // Номер попытки сохранения: ключ текста ошибки, чтобы скринридер заново
  // озвучил ту же ошибку при повторном нажатии.
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [connections, setConnections] = useState<AgentConnection[]>([])
  const [oauthNotice, setOauthNotice] = useState<'connected' | 'error' | null>(null)
  const [forbidden, setForbidden] = useState(false)
  // Instagram/WhatsApp self-serve connect is founder-only for now even
  // though the section itself opened to Pro customers (2026-09-02) -- both
  // depend on Meta app review the founder still has to finish personally;
  // real customers see "Канал в работе" instead of a working button.
  const [isAdmin, setIsAdmin] = useState(false)
  // ambiguous_agent (2026-09-02): a bare /ai-agent/settings visit with no
  // ?agent= on an account with 2+ agents -- the settings API can't guess
  // which one, so this renders an inline message instead of the form.
  const [ambiguousAgent, setAmbiguousAgent] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  // Whether the owner has an active Kaspi Shop connection -- drives the
  // «Подключите Kaspi Shop» hint on Промптинг. null = not checked yet
  // (hint stays hidden until we actually know, rather than flashing).
  const [hasKaspiShop, setHasKaspiShop] = useState<boolean | null>(null)
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
  // '' means every surface. Only Instagram distinguishes the two, so the
  // picker is shown as a plain three-way choice rather than a per-channel grid.
  const [tplFormChannel, setTplFormChannel] = useState('')
  // Hoisted out of the templates list: inside templates.map the loop
  // variable is also called `t` and shadows the dictionary.
  const templateChannelChoices: [string, string][] = [
    ['', tf.templateChannelAll],
    ['comment', t.sourceComment],
    ['dm', t.sourceDm],
  ]
  const [tplEditChannel, setTplEditChannel] = useState('')
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

  // SDK Meta для WhatsApp Embedded Signup -- сразу при открытии страницы, как
  // было до выноса карточек в ChannelCards (B3).
  useEffect(() => { ensureFacebookSdk() }, [])

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

    // Real catalog prices only reach the agent's prompt when an active
    // store connection exists (invoiceSend.ts's Kaspi Shop rule) -- this
    // just informs the Промптинг hint, best-effort like the sibling loaders.
    async function loadKaspiShopStatus(headers: Record<string, string>) {
      try {
        const res = await fetch('/api/kaspi-shop/connections', { headers })
        if (res.ok) {
          const data = await res.json()
          setHasKaspiShop(Array.isArray(data.connections) && data.connections.some((c: any) => c.isActive))
        }
      } catch { /* hint stays hidden -- not worth a broken-looking banner */ }
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
      // AI-агент is open to admins (testing) and active Pro-plan users
      // (2026-09-02, opened up now that Telegram/WhatsApp/website/API are
      // proven live -- Instagram stays disabled below pending Meta review).
      // The real enforcement is server-side (the API routes below 403
      // admin_only for anyone that fails this same check); this just swaps
      // their redirect-to-/dashboard for an inline message, since a redirect
      // can misfire on a legitimate session that hasn't finished loading yet.
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      if (!profile?.is_admin && !getActivePlan(profile).canAiAgent) { setForbidden(true); setLoading(false); return }
      setIsAdmin(!!profile?.is_admin)
      // Создание нового агента для админа -- мастер «сначала канал»
      // (/ai-agent/setup, 16.10.2026). Остальные Про пока создают здесь, как
      // раньше: мастер открыт только админам до проверки основателем.
      // from/back («сходи и вернись», crossProduct.ts) едут с собой (B13);
      // params прочитаны в начале эффекта, до того как HandoffBanner убрал
      // их из адреса.
      if (isNew && canUseSetupWizard(!!profile?.is_admin)) {
        const carry = new URLSearchParams()
        for (const k of ['from', 'back']) { const v = params.get(k); if (v) carry.set(k, v) }
        const qs = carry.toString()
        router.replace(qs ? `/ai-agent/setup?${qs}` : '/ai-agent/setup')
        return
      }
      const headers = await authHeader()
      loadWalletBalance(headers)
      loadKaspiShopStatus(headers)
      const res = await fetch(
        agentParam ? `/api/ai-agent/settings?agentId=${encodeURIComponent(agentParam)}` :
        isNew ? '/api/ai-agent/settings?new=1' :
        '/api/ai-agent/settings',
        { headers }
      )
      if (res.status === 404) {
        // ?agent= pointing at a deleted/foreign agent -- nothing to show,
        // back to the list.
        router.push('/ai-agent')
        return
      }
      if (res.status === 400) {
        // ambiguous_agent (2026-09-02): a bare /ai-agent/settings visit (no
        // ?agent=, no ?new=1) on an account with 2+ agents -- the API
        // refuses to guess which one. Shown inline (see the ambiguousAgent
        // render branch below) rather than silently redirected away, since
        // this can also be reached via a real failure notice (Instagram
        // OAuth error) that the user still needs to see.
        setAmbiguousAgent(true)
        setLoading(false)
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
          if (Array.isArray(data.agent.stopPhrases)) setStopPhrases(data.agent.stopPhrases)
          if (typeof data.agent.historyPairs === 'number') setHistoryPairs(data.agent.historyPairs)
          if (typeof data.agent.isEnabled === 'boolean') setIsEnabled(data.agent.isEnabled)
          setAgentStatus(data.agent.status || '')
          setTrainingCount(data.agent.trainingMessageCount || 0)
          setTrainingFirstDraftAt(data.agent.trainingFirstDraftAt || null)
          setTrainingExitPending(!!data.agent.trainingExitPending)
          setConnections(data.connections || [])
          setKaspiShopConnectionId(data.agent.kaspiShopConnectionId || '')
          setKaspiCatalogOff(data.agent.kaspiCatalogOff === true)
          setMetaPixelId(data.agent.metaPixelId || null)
          // Secondary data (badge count + saved templates) loads in the
          // background -- neither should hold up first paint of the form.
          loadReviewCount(headers)
          loadTemplates(headers, data.agent.id)
        } else {
          setName(data.suggestedName || tf.defaultAgentName)
        }
        // Returned for a new agent too, so the store can be chosen before the
        // first save rather than only on a second visit.
        setKaspiShops(data.kaspiShops || [])
        setKaspiCatalogSupported(data.kaspiCatalogSupported === true)
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
    // Тумблер статуса ещё сохраняется -- ждём его, иначе POST и PATCH
    // гоняются за is_enabled.
    if (savingRef.current || statusBusyRef.current) return
    const isFirstCreation = !agentId
    setSaveAttempt(n => n + 1)
    setSaveError(null)
    setSavedFlash(false)
    if (savedTimerRef.current) { clearTimeout(savedTimerRef.current); savedTimerRef.current = null }

    // Сервер проверяет только пустую строку; название из пробелов ловим тут,
    // чтобы не ждать ответа ради очевидной ошибки.
    if (isBlankAgentName(name)) {
      setSaveError('name_required')
      return
    }

    setSaving(true)
    savingRef.current = true
    let res: Response | null = null
    let data: any = null
    try {
      const headers = await authHeader()
      res = await fetch('/api/ai-agent/settings', {
        method: 'POST',
        headers,
        // agentId present -> UPDATE that agent; absent -> CREATE a new one.
        // is_enabled существующего агента принадлежит тумблеру (PATCH сразу
        // при переключении) -- POST его не трогает, иначе медленный POST со
        // старым значением перетирал только что сохранённый тумблер. Новый
        // агент создаётся с тем значением, что выставлено в форме.
        body: JSON.stringify({ ...(agentId ? { agentId } : { isEnabled }), name, tone, businessDescription, goal, collectFields, timezone, currency, customInstructions, historyPairs, stopPhrases, kaspiShopConnectionId: kaspiCatalogOff ? null : (kaspiShopConnectionId || null), ...(kaspiCatalogSupported ? { kaspiCatalogOff } : {}) }),
      })
      data = await res.json().catch(() => null)
    } catch {
      res = null
    }

    if (!res || !res.ok || !data?.agent?.id) {
      const kind = settingsSaveErrorKind(res?.status ?? 0, data?.error)
      // Закреплённого магазина больше нет: убираем его из списка, чтобы
      // выбор магазина показался (см. pinnedShopMissing) и сохранение можно
      // было исправить без перезагрузки страницы.
      if (kind === 'kaspi_shop' && kaspiShopConnectionId) {
        const missing = kaspiShopConnectionId
        setKaspiShops(prev => prev.filter(s => s.id !== missing))
      }
      setSaveError(kind)
      setSaving(false)
      savingRef.current = false
      return
    }

    setAgentId(data.agent.id)
    if (isFirstCreation) {
      // Новый агент стартует в режиме обучения (default колонки status) --
      // берём его из ответа, чтобы баннер обучения появился сразу.
      setAgentStatus(data.agent.status || '')
      setTrainingCount(data.agent.training_message_count || 0)
      // Только что созданный агент: черновиков ещё нет, отсчёт дней не начался.
      setTrainingFirstDraftAt(null)
      setTrainingExitPending(false)
      // Pin the URL to the created agent so a refresh EDITS it instead of
      // re-creating (drops any ?new=1 too) and lands on «Каналы» -- the step
      // without which the agent answers nobody. history.replaceState, not
      // router.replace -- router.replace is known-broken for query-only
      // changes in this app (see src/app/create/page.tsx).
      window.history.replaceState({}, '', `/ai-agent/settings?agent=${data.agent.id}&tab=channels`)
      scrollToChannelHintRef.current = true
      setTab('channels')
    } else {
      setSavedFlash(true)
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS)
    }
    setSaving(false)
    savingRef.current = false
  }

  // «Статус бота»: у существующего агента -- сохранение сразу, без общей
  // кнопки (раньше выключение терялось, если не нажать «Сохранить»). До
  // создания агента сохранять некуда: значение уйдёт вместе с созданием.
  async function toggleEnabled() {
    // aria-disabled, а не disabled (фокус клавиатуры не теряется) -- поэтому
    // нажатие во время сохранения игнорируется здесь.
    if (statusBusyRef.current || savingRef.current) return
    const next = !isEnabled
    setIsEnabled(next)
    setStatusError(false)
    setStatusSaved(false)
    if (statusTimerRef.current) { clearTimeout(statusTimerRef.current); statusTimerRef.current = null }
    if (!agentId) return

    setStatusBusy(true)
    statusBusyRef.current = true
    let ok = false
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/ai-agent/agents/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isEnabled: next }),
      })
      const data = await res.json().catch(() => null)
      ok = res.ok && data?.agent?.isEnabled === next
    } catch {
      ok = false
    }
    if (ok) {
      setStatusSaved(true)
      statusTimerRef.current = setTimeout(() => setStatusSaved(false), SAVED_FLASH_MS)
    } else {
      setIsEnabled(!next)
      setStatusError(true)
    }
    setStatusBusy(false)
    statusBusyRef.current = false
  }

  // Кнопка «Создать агента» стоит внизу длинной формы: после переключения на
  // «Каналы» подсказка оказалась бы выше экрана (особенно на телефоне) --
  // докручиваем к ней один раз, в момент, когда она реально появилась в DOM.
  const channelHintRef = useCallback((el: HTMLDivElement | null) => {
    if (!el || !scrollToChannelHintRef.current) return
    scrollToChannelHintRef.current = false
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }))
  }, [reduceMotion])

  // Любая правка формы снимает устаревшую ошибку сохранения.
  useEffect(() => {
    setSaveError(null)
  }, [name, tone, businessDescription, goal, collectFields, timezone, currency, customInstructions, historyPairs, stopPhrases, kaspiShopConnectionId, kaspiCatalogOff])

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
  }, [])

  async function connectMetaCapi() {
    if (!agentId || !metaPixelIdInput.trim() || !metaTokenInput.trim()) return
    setMetaCapiBusy(true)
    setMetaCapiError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/meta-capi/connect', {
        method: 'POST', headers,
        body: JSON.stringify({ agentId, pixelId: metaPixelIdInput.trim(), accessToken: metaTokenInput.trim() }),
      })
      if (res.ok) {
        setMetaPixelId(metaPixelIdInput.trim())
        setMetaTokenInput('')
      } else {
        setMetaCapiError('Не удалось сохранить. Проверьте Pixel ID и токен.')
      }
    } catch {
      setMetaCapiError('Не удалось сохранить. Проверьте Pixel ID и токен.')
    }
    setMetaCapiBusy(false)
  }

  async function disconnectMetaCapi() {
    if (!agentId) return
    setMetaCapiBusy(true)
    setMetaCapiError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/meta-capi/connect', {
        method: 'DELETE', headers, body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        setMetaPixelId(null)
        setMetaPixelIdInput('')
      } else {
        setMetaCapiError('Не удалось отключить. Попробуйте ещё раз.')
      }
    } catch {
      setMetaCapiError('Не удалось отключить. Попробуйте ещё раз.')
    }
    setMetaCapiBusy(false)
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
        body: JSON.stringify({ agentId, triggerWords: tplFormWords, replyText: tplFormText.trim(), channel: tplFormChannel || null }),
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(prev => [...prev, data.template])
        setTplFormOpen(false)
        setTplFormWords([])
        setTplFormText('')
      } else {
        setTplError(tf.errSaveTemplate)
      }
    } catch {
      setTplError(tf.errSaveTemplate)
    }
    setTplBusy(false)
  }

  function startEditTemplate(t: ReplyTemplate) {
    setTplEditId(t.id)
    setTplEditWords(t.triggerWords)
    setTplEditText(t.replyText)
    setTplEditChannel(t.channel || '')
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
        body: JSON.stringify({ id: tplEditId, triggerWords: tplEditWords, replyText: tplEditText.trim(), channel: tplEditChannel || null }),
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(prev => prev.map(t => t.id === data.template.id ? data.template : t))
        setTplEditId(null)
      } else {
        setTplError(tf.errSaveChanges)
      }
    } catch {
      setTplError(tf.errSaveChanges)
    }
    setTplBusy(false)
  }

  async function removeTemplate(id: string) {
    if (!(await confirm(tf.confirmDeleteTemplate))) return
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
        setTplError(tf.errDeleteTemplate)
      }
    } catch {
      setTplError(tf.errDeleteTemplate)
    }
    setTplBusy(false)
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>{tf.loadingLabel}</div>
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

  if (ambiguousAgent) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-2xl mx-auto p-4 lg:p-6">
        {oauthNotice === 'error' && (
          <div className="rounded-lg px-3 py-2 text-sm mb-4" style={{ background: 'var(--nav-critical)', color: '#fff' }}>
            {tf.errConnectInstagram}
          </div>
        )}
        <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>
          {tf.noAgentSelected}
        </div>
        <div className="flex justify-center">
          <Link href="/ai-agent"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
            {tf.toAgentsList}
          </Link>
        </div>
      </div>
    </main>
    </DesktopShell>
  )

  // The real server-side context line, assembled from the same visible
  // field values (promptContext is pure/portable). Labeled «примерный»
  // because the live prompt wraps additional system text around this line.
  const promptPreview = buildBusinessContextLine({
    name: name.trim() || tf.defaultBusinessName,
    tone: tone as AgentTone,
    description: businessDescription,
    goal: goal as AgentGoal,
    collectFields,
    timezone,
    currency,
    customInstructions,
  })

  // Агент закреплён за магазином, которого нет в списке (удалён после
  // загрузки страницы) -- выбор магазина показывается даже при одном
  // оставшемся, иначе каждое сохранение падало бы без способа это исправить.
  const pinnedShopMissing = !!kaspiShopConnectionId && !kaspiShops.some(s => s.id === kaspiShopConnectionId)

  const saveErrorText = saveError === 'name_required' ? tf.errSaveNameRequired
    : saveError === 'kaspi_shop' ? tf.errSaveKaspiShop
    : saveError === 'kaspi_migration' ? tf.errSaveKaspiMigration
    : saveError === 'forbidden' ? tf.errSaveForbidden
    : saveError === 'not_found' ? tf.errSaveNotFound
    : saveError ? tf.errSaveChanges
    : null

  const saveButton = (
    <div>
      <button onClick={save} disabled={saving || statusBusy}
        className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}>
        {saving ? tf.savingAgentButton : agentId ? tf.saveAgentButton : tf.createAgentButton}
      </button>
      {/* Итог сохранения -- aria-live, чтобы скринридер тоже его услышал. */}
      <div role="status" aria-live="polite" className="min-h-[1.25rem] mt-2 text-xs text-center">
        {saveErrorText ? (
          <span key={saveAttempt} style={{ color: 'var(--nav-critical)' }}>{saveErrorText}</span>
        ) : savedFlash ? (
          <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--nav-success)' }}>
            <CheckCircleIcon /> {tf.saveSuccess}
          </span>
        ) : null}
      </div>
    </div>
  )

  const needsAgentHint = (text: string) => (
    <div className="nav-glass nav-card-accent rounded-2xl p-5 text-sm text-center" style={{ color: 'var(--nav-text-muted)' }}>
      {text}{' '}
      <button onClick={() => switchTab('settings')} className="font-medium underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
        {tf.goToSettings}
      </button>
    </div>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-2xl mx-auto p-4 lg:p-6 pb-6">
        <motion.div
          className="flex items-start justify-between gap-3 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <Link href="/ai-agent" className="inline-flex items-center gap-1 text-xs mb-2 transition-colors hover:text-[color:var(--nav-text-secondary)]" style={{ color: 'var(--nav-text-muted)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
              {t.backToAgents}
            </Link>
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.agentPageTitle}</h1>
            {agentId && (
              <div className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold mb-2" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                {t.agentLabel(name)}
              </div>
            )}
            <p className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>{t.agentPageSubtitle}</p>
          </div>
          {/* Persistent across all five tabs (MoonAI-style shortcut) --
              disabled with a tooltip until the agent has a real id: a
              ?new=1 agent isn't in the DB yet, so there's nothing for the
              test-chat API to look up. */}
          <button
            onClick={openTestChat}
            disabled={!agentId}
            title={agentId ? undefined : tf.testChatDisabledHint}
            className="flex items-center gap-1.5 nav-glass rounded-lg px-3 py-2 text-sm font-medium flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-[color:var(--nav-bg)]"
            style={{ color: 'var(--nav-text-primary)' }}
          >
            <TestChatBubbleIcon /> {t.testChatButton}
          </button>
        </motion.div>

        {oauthNotice === 'connected' && (
          <div className="rounded-lg px-3 py-2 text-sm mb-4 flex items-center gap-2" style={{ background: 'var(--nav-success-solid)', color: 'var(--nav-success-ink)' }}>
            <CheckCircleIcon /> {t.chipConnected('Instagram')}
          </div>
        )}
        {oauthNotice === 'error' && (
          <div className="rounded-lg px-3 py-2 text-sm mb-4" style={{ background: 'var(--nav-critical)', color: '#fff' }}>
            {tf.errConnectInstagram}
          </div>
        )}

        {/* MoonAI-style horizontal tab bar (research §1): pill tabs, active
            state on --nav-accent, layoutId slide between tabs. */}
        <motion.div
          className="nav-glass rounded-xl p-1 mb-5 flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label={tf.tabsAria}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.04 }}
        >
          {TABS.map(tabDef => {
            const active = tab === tabDef.key
            return (
              <button key={tabDef.key} role="tab" aria-selected={active} onClick={() => switchTab(tabDef.key)}
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
                <span className="relative z-[1]">{tabLabel(t, tabDef.key)}</span>
              </button>
            )
          })}
        </motion.div>

        {agentStatus === 'training' && agentId && (
          <div className="nav-glass rounded-2xl p-4 lg:p-5 mb-4" style={{ borderLeft: '3px solid var(--nav-magenta)' }}>
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{tf.trainingTitle}</div>
            <p className="text-[13px] mb-2" style={{ color: 'var(--nav-text-secondary)' }}>{tf.trainingBody}</p>
            <div className="text-[13px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
              {(() => {
                // Срок в днях идёт от первого черновика на проверке (не от
                // создания агента); статус здесь только показывается.
                if (trainingExitPending) return tf.trainingExitPending
                const approvalsLeft = Math.max(0, TRAINING_MESSAGE_THRESHOLD - trainingCount)
                const daysLeft = trainingDaysLeft(trainingFirstDraftAt, new Date())
                return daysLeft === null
                  ? tf.trainingLeftNoDraft(approvalsLeft, TRAINING_DAYS_THRESHOLD)
                  : tf.trainingLeft(approvalsLeft, daysLeft)
              })()}
            </div>
            <Link href="/ai-agent/review" className="text-[13px] font-semibold" style={{ color: 'var(--nav-accent)' }}>{tf.trainingLink}</Link>
          </div>
        )}

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
                  <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.companyNameLabel}</span>
                  <input
                    className={INPUT_CLS}
                    style={{ color: 'var(--nav-text-primary)' }}
                    value={name} onChange={e => setName(e.target.value)} />
                </label>

                <div className="mb-4">
                  <span className="text-xs mb-2 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.toneLabel}</span>
                  <div className="grid grid-cols-2 gap-2">
                    {TONE_VALUES.map(v => {
                      const active = tone === v
                      return (
                        <button key={v} onClick={() => setTone(v)}
                          className="text-xs px-3 py-2 rounded-lg text-left transition-colors"
                          style={active ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                          {tf.toneLabels[v]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label className="block mb-4">
                  <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.businessDescriptionLabel}</span>
                  <textarea
                    className={`${INPUT_CLS} min-h-[100px]`}
                    style={{ color: 'var(--nav-text-primary)' }}
                    placeholder={tf.businessDescriptionPlaceholder}
                    value={businessDescription} onChange={e => setBusinessDescription(e.target.value)} />
                </label>

                <div className="mb-4">
                  <span className="text-xs mb-2 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.goalLabel}</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {GOAL_VALUES.map(v => {
                      const active = goal === v
                      return (
                        <button key={v} onClick={() => setGoal(v)}
                          className="text-xs px-3 py-2 rounded-lg transition-colors"
                          style={active ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                          {tf.goalLabels[v]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mb-4">
                  <span className="text-xs mb-2 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.collectFieldsLabel}</span>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-2">
                    {COLLECT_FIELD_VALUES.map(v => (
                      <label key={v} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--nav-text-primary)' }}>
                        <input type="checkbox" checked={collectFields.includes(v)} onChange={() => toggleCollectField(v)}
                          className="accent-[var(--nav-accent)] w-3.5 h-3.5 flex-shrink-0" />
                        {tf.collectFieldLabels[v]}
                      </label>
                    ))}
                  </div>
                  {/* Custom fields the user has added (anything not a preset key) */}
                  {collectFields.filter(f => !COLLECT_FIELD_VALUES.includes(f)).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {collectFields.filter(f => !COLLECT_FIELD_VALUES.includes(f)).map(f => (
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
                        placeholder={tf.customFieldPlaceholder}
                        className={`flex-1 ${INPUT_CLS}`}
                        style={{ color: 'var(--nav-text-primary)' }} />
                      <button onClick={addCustomField}
                        className="text-xs px-3 py-2 rounded-lg font-semibold flex-shrink-0"
                        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        {tf.addButton}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setShowCustomInput(true)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                      {tf.addOwnButton}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  <label className="block">
                    <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.timezoneLabel}</span>
                    <select value={timezone} onChange={e => setTimezone(e.target.value)}
                      className={INPUT_CLS}
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                      {TIMEZONE_VALUES.map(v => <option key={v} value={v}>{`${v} (GMT+5) — ${tf.timezoneCity[v]}`}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.currencyLabel}</span>
                    <select value={currency} onChange={e => setCurrency(e.target.value)}
                      className={INPUT_CLS}
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                      {CURRENCY_VALUES.map(v => <option key={v} value={v}>{tf.currencyLabels[v]}</option>)}
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
                    <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.customInstructionsLabel}</span>
                    <textarea
                      className={`${INPUT_CLS} min-h-[120px]`}
                      style={{ color: 'var(--nav-text-primary)' }}
                      maxLength={2000}
                      placeholder={tf.customInstructionsPlaceholder}
                      value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} />
                    <span className="text-[11px] mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>
                      {tf.customInstructionsHint}
                    </span>
                  </label>

                  <label className="block mb-6">
                    <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.stopPhrasesLabel}</span>
                    <TriggerChipsEditor words={stopPhrases} onChange={setStopPhrases} placeholder={tf.triggerPlaceholder} />
                    <span className="text-[11px] mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>
                      {tf.stopPhrasesHint}
                    </span>
                  </label>

                  {saveButton}
                </div>

                {hasKaspiShop === false && !kaspiCatalogOff && (
                  <div className="nav-glass nav-card-accent rounded-2xl p-5 mt-4">
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{tf.connectShopTitle}</div>
                    <p className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                      {tf.connectShopText}
                    </p>
                    <a href={crossHref('kaspiShop', '/kaspi-shop', 'aiAgent', '/ai-agent/settings')} className="text-xs font-semibold" style={{ color: 'var(--nav-accent)' }}>{tf.connectShopCta}</a>
                  </div>
                )}

                <div className="nav-glass nav-card-accent rounded-2xl p-5 mt-4">
                  <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{tf.promptPreviewTitle}</div>
                  <p className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                    {tf.promptPreviewHint}
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
                    <span className="text-sm font-semibold block" style={{ color: 'var(--nav-text-primary)' }}>{tf.botStatusLabel}</span>
                    <span className="text-[11px] block mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>
                      {tf.botStatusHint}
                    </span>
                  </div>
                  <button role="switch" aria-checked={isEnabled} aria-label={tf.botStatusLabel}
                    onClick={toggleEnabled}
                    aria-disabled={statusBusy || saving}
                    aria-busy={statusBusy}
                    className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5"
                    style={{ background: isEnabled ? 'var(--nav-accent)' : 'var(--nav-border)', opacity: statusBusy || saving ? 0.6 : 1, cursor: statusBusy || saving ? 'default' : undefined }}>
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: isEnabled ? '18px' : '2px' }} />
                  </button>
                </div>
                {/* Тумблер сохраняется сам -- общая кнопка «Сохранить» ниже
                    для остальных полей вкладки. */}
                <div role="status" aria-live="polite" className="text-[11px] min-h-[1rem] mt-1">
                  {statusError ? (
                    <span style={{ color: 'var(--nav-critical)' }}>{tf.errBotStatus}</span>
                  ) : statusSaved ? (
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--nav-success)' }}><CheckCircleIcon /> {tf.botStatusSaved}</span>
                  ) : !agentId ? (
                    <span style={{ color: 'var(--nav-text-muted)' }}>{tf.botStatusOnCreateHint}</span>
                  ) : null}
                </div>

                <div className="my-5" style={{ borderTop: '1px solid var(--nav-border-soft)' }} />

                <label className="block mb-6">
                  <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.historyDepthLabel}</span>
                  <select value={historyPairs} onChange={e => setHistoryPairs(Number(e.target.value))}
                    className={INPUT_CLS}
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                    {[3, 5, 8, 10, 20].map(n => <option key={n} value={n}>{tf.historyOption(n)}</option>)}
                  </select>
                  <span className="text-[11px] mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>
                    {tf.historyDepthHint}
                  </span>
                </label>

                {/* Only worth showing when there is a choice to make: with one
                    store the default already points at it, and with none the
                    agent has no catalog to quote from at all. */}
                {(kaspiShops.length > 1 || pinnedShopMissing || (kaspiShops.length >= 1 && kaspiCatalogSupported)) && (
                  <label className="block mb-6">
                    <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.kaspiShopLabel}</span>
                    <select value={kaspiCatalogOff ? KASPI_OFF_VALUE : kaspiShopConnectionId}
                      onChange={e => {
                        // Первый пункт -- полный отказ от магазина: флаг вверх,
                        // закрепление снято. Любой другой пункт флаг снимает.
                        const v = e.target.value
                        setKaspiCatalogOff(v === KASPI_OFF_VALUE)
                        setKaspiShopConnectionId(v === KASPI_OFF_VALUE ? '' : v)
                      }}
                      className={INPUT_CLS}
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                      {kaspiCatalogSupported && <option value={KASPI_OFF_VALUE}>{tf.kaspiShopOffOption}</option>}
                      <option value="">{tf.kaspiShopDefaultOption}</option>
                      {pinnedShopMissing && (
                        <option value={kaspiShopConnectionId} disabled>{tf.kaspiShopMissingOption}</option>
                      )}
                      {kaspiShops.map(s => (
                        <option key={s.id} value={s.id}>{s.name}{s.isActive ? tf.kaspiShopActiveSuffix : ''}</option>
                      ))}
                    </select>
                    <span className="text-[11px] mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>
                      {tf.kaspiShopHint}{kaspiCatalogSupported ? ` ${tf.kaspiShopHintOff}` : ''}
                    </span>
                    {kaspiCatalogOff && (
                      <span className="text-[11px] mt-1.5 block font-medium" style={{ color: 'var(--nav-text-secondary)' }}>
                        {tf.kaspiShopOffNote}
                      </span>
                    )}
                  </label>
                )}

                {saveButton}
              </div>
            )}

            {tab === 'control' && (
              <div className="nav-glass nav-card-accent rounded-2xl p-5 mt-4">
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{tf.replyCostTitle}</div>
                <p className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                  {tf.replyCostText(REPLY_PRICE_TENGE)}
                </p>
                {walletBalance !== null && (
                  <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                    {tf.walletBalanceLabel} <b style={{ color: 'var(--nav-text-primary)' }}>{walletBalance.toLocaleString('ru-KZ')} ₸</b>
                    {' '}{tf.walletEnoughFor} <b style={{ color: 'var(--nav-text-primary)' }}>{Math.max(0, Math.floor(walletBalance / REPLY_PRICE_TENGE)).toLocaleString('ru-KZ')}</b> {tf.walletRepliesSuffix}
                    <span className="block mt-1" style={{ color: 'var(--nav-text-muted)' }}>{tf.walletSharedHint}</span>
                  </div>
                )}
              </div>
            )}

            {tab === 'templates' && (
              !agentId ? needsAgentHint(tf.needsAgentTemplates) : (
                <div>
                  <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                    {tf.templatesHint}
                  </p>

                  {templates.length === 0 && !tplFormOpen && (
                    <div className="nav-glass nav-card-accent rounded-2xl p-5 text-sm text-center mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                      {tf.templatesEmpty}
                    </div>
                  )}

                  <div className="space-y-3">
                    {templates.map(t => (
                      <div key={t.id} className="nav-glass nav-card-accent rounded-2xl p-4">
                        {tplEditId === t.id ? (
                          <div>
                            <span className="text-xs mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.triggerWordsLabel}</span>
                            <TriggerChipsEditor words={tplEditWords} onChange={setTplEditWords} placeholder={tf.triggerPlaceholder} />
                            <span className="text-xs mt-3 mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.replyTextLabel}</span>
                            <textarea
                              className={`${INPUT_CLS} min-h-[80px]`}
                              style={{ color: 'var(--nav-text-primary)' }}
                              maxLength={2000}
                              value={tplEditText} onChange={e => setTplEditText(e.target.value)} />
                            <span className="text-xs mt-3 mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.templateChannelLabel}</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {templateChannelChoices.map(([value, label]) => (
                                <button key={value || 'all'} type="button" onClick={() => setTplEditChannel(value)}
                                  className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                                  style={tplEditChannel === value
                                    ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                                    : { background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                            <span className="text-[11px] mt-1.5 block" style={{ color: 'var(--nav-text-muted)' }}>{tf.templateChannelHint}</span>
                            <div className="flex gap-2 mt-3">
                              <button onClick={saveEditTemplate} disabled={tplBusy || tplEditWords.length === 0 || !tplEditText.trim()}
                                className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                                {tplBusy ? tf.savingButton : tf.saveButton}
                              </button>
                              <button onClick={() => setTplEditId(null)} disabled={tplBusy}
                                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                                style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                                {tf.cancelButton}
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
                                {/* Only shown when the template is scoped: an
                                    unscoped one answers everywhere, which is
                                    the default and needs no badge. */}
                                {t.channel && (
                                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ background: 'var(--nav-teal)', color: '#fff' }}>
                                    {t.channel === 'comment' ? templateChannelChoices[1][1] : templateChannelChoices[2][1]}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <button onClick={() => startEditTemplate(t)} aria-label={tf.editTemplateAria}
                                  className="p-1.5 rounded-lg transition-colors hover:text-[color:var(--nav-accent)]"
                                  style={{ color: 'var(--nav-text-muted)' }}>
                                  <PencilIcon />
                                </button>
                                <button onClick={() => removeTemplate(t.id)} disabled={tplBusy} aria-label={tf.deleteTemplateAria}
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
                      <span className="text-xs mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.triggerWordsLabel}</span>
                      <TriggerChipsEditor words={tplFormWords} onChange={setTplFormWords} placeholder={tf.triggerPlaceholder} />
                      <span className="text-xs mt-3 mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.replyTextLabel}</span>
                      <textarea
                        className={`${INPUT_CLS} min-h-[80px]`}
                        style={{ color: 'var(--nav-text-primary)' }}
                        maxLength={2000}
                        placeholder={tf.replyTextPlaceholder}
                        value={tplFormText} onChange={e => setTplFormText(e.target.value)} />
                      <span className="text-xs mt-3 mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>{tf.templateChannelLabel}</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {templateChannelChoices.map(([value, label]) => (
                          <button key={value || 'all'} type="button" onClick={() => setTplFormChannel(value)}
                            className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                            style={tplFormChannel === value
                              ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                              : { background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <span className="text-[11px] mt-1.5 block" style={{ color: 'var(--nav-text-muted)' }}>{tf.templateChannelHint}</span>
                      <div className="flex gap-2 mt-3">
                        <button onClick={createTemplate} disabled={tplBusy || tplFormWords.length === 0 || !tplFormText.trim()}
                          className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                          {tplBusy ? tf.savingButton : tf.addButton}
                        </button>
                        <button onClick={() => { setTplFormOpen(false); setTplFormWords([]); setTplFormText('') }} disabled={tplBusy}
                          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                          style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                          {tf.cancelButton}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setTplFormOpen(true); setTplError(null) }}
                      className="w-full nav-glass rounded-2xl px-4 py-3 text-sm font-medium mt-3 transition-transform hover:-translate-y-0.5"
                      style={{ color: 'var(--nav-accent)' }}>
                      {tf.addTemplateButton}
                    </button>
                  )}

                  {tplError && (
                    <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{tplError}</div>
                  )}
                </div>
              )
            )}

            {tab === 'flows' && (
              !agentId ? needsAgentHint(tf.needsAgentFlows) : (
                <FlowBuilder agentId={agentId} authHeader={authHeader} />
              )
            )}

            {/* «Каналы» с агентом рисуются НЕ здесь, а ниже, вне AnimatePresence
                (B3): этот блок монтируется заново на каждой смене вкладки, и
                ChannelCards терял одноразовый показ API-ключа, введённый
                токен Telegram и слушатель окна WhatsApp посреди подключения. */}
            {tab === 'channels' && !agentId && needsAgentHint(tf.needsAgentChannels)}
          </motion.div>
        </AnimatePresence>

        {/* Вкладка «Каналы» -- всегда смонтирована, пока есть агент, и просто
            скрыта на других вкладках: состояние подключения (ключ API, форма
            Telegram, Embedded Signup WhatsApp) переживает переключение, как
            было до выноса карточек в ChannelCards. Появление -- с той же
            задержкой, что и уход прошлой вкладки (mode="wait" выше). */}
        {agentId && (
          <motion.div
            hidden={tab !== 'channels'}
            initial={false}
            animate={tab === 'channels' ? 'shown' : 'hiddenTab'}
            variants={{
              shown: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.25, ease: EASE, delay: reduceMotion ? 0 : 0.15 } },
              hiddenTab: { opacity: 0, y: reduceMotion ? 0 : 10, transition: { duration: 0 } },
            }}
          >
                {/* Видна сразу после создания (save() открывает эту вкладку)
                    и вообще пока ни один канал не работает: без канала агент
                    никому не отвечает. */}
                {!connections.some(c => c.status === 'active') && (
                  <div ref={channelHintRef} className="rounded-xl px-3.5 py-2.5 mb-3 text-sm scroll-mt-24" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', borderLeft: '3px solid var(--nav-accent)' }}>
                    {tf.connectChannelHint}
                  </div>
                )}
                <ChannelCards
                  key={agentId}
                  agentId={agentId}
                  connections={connections}
                  setConnections={setConnections}
                  onClearNotice={() => setOauthNotice(null)}
                  whatsappExtra={<WhatsAppUsage agentId={agentId} />}
                />

                <div className="mt-6">
                  <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>
                    Реклама
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ChannelCard
                      icon={<ApiIcon />}
                      name="Meta Pixel / CAPI"
                      chip={metaPixelId
                        ? <StatusChip kind="ok" label={tf.connectedChip} />
                        : <StatusChip kind="off" label={t.chipNotConnected} />}
                      description="Переписки, начатые по клику на рекламу WhatsApp, засчитываются как лиды в вашем рекламном кабинете Meta."
                    >
                      {metaPixelId ? (
                        <div className="flex gap-2">
                          <button onClick={disconnectMetaCapi} disabled={metaCapiBusy}
                            className="flex-1 nav-glass rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
                            {metaCapiBusy ? '…' : t.disconnectButton}
                          </button>
                        </div>
                      ) : (
                        <>
                          <input type="text" placeholder="Pixel ID" value={metaPixelIdInput}
                            onChange={e => setMetaPixelIdInput(e.target.value)}
                            className="w-full mb-2 text-xs rounded-lg px-3 py-2 nav-glass" style={{ color: 'var(--nav-text-primary)' }} />
                          <input type="password" placeholder="Токен доступа" value={metaTokenInput}
                            onChange={e => setMetaTokenInput(e.target.value)}
                            className="w-full mb-2 text-xs rounded-lg px-3 py-2 nav-glass" style={{ color: 'var(--nav-text-primary)' }} />
                          <button onClick={connectMetaCapi} disabled={metaCapiBusy || !metaPixelIdInput.trim() || !metaTokenInput.trim()}
                            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                            {metaCapiBusy ? tf.connectingButton : t.connectButton}
                          </button>
                          <p className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                            Pixel ID и токен — в Meta Events Manager → источники данных → ваш Pixel → Настройки → Генерировать токен доступа.
                          </p>
                        </>
                      )}
                      {metaCapiError && (
                        <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{metaCapiError}</div>
                      )}
                    </ChannelCard>
                  </div>
                </div>
          </motion.div>
        )}

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
                {t.reviewQueueLink}
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
              aria-label={tf.testChatTitle}
            >
              <div className="flex items-center justify-between gap-3 px-4 lg:px-5 py-4 border-b border-[color:var(--nav-border)] flex-shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
                    <TestChatBubbleIcon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{tf.testChatTitle}</div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--nav-text-muted)' }}>{name.trim() || tf.testChatAgentFallback}</div>
                  </div>
                </div>
                <button onClick={() => setTestChatOpen(false)} aria-label={tf.closeAria}
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

      {dialogElement}
    </main>
    </DesktopShell>
  )
}
