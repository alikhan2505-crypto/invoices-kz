'use client'
import { useState, useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { aiAgentDict } from '@/lib/i18n/aiAgent'
import { aiAgentFormsDict } from '@/lib/i18n/aiAgentForms'
import { buildWidgetSnippet } from '@/lib/aiAgent/widgetSnippet'
import { useAppDialog } from '@/components/AppDialog'

// Карточки каналов AI-агента (16.10.2026) -- вынесены из вкладки «Каналы»
// /ai-agent/settings, чтобы мастер /ai-agent/setup и настройки делили одну
// логику подключения (Instagram OAuth, Telegram-токен, WhatsApp Embedded
// Signup, чат для сайта, API). Поведение настроек не меняется: layout
// 'settings' рисует те же пять карточек в том же порядке и сетке, что и
// раньше. layout 'wizard' -- WhatsApp крупно первым, потом Instagram,
// Telegram и чат для сайта; API в мастере нет (он в «Тонкой настройке»).

export type AgentConnection = { channel: string; external_account_id: string; external_account_name: string | null; status: string }

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

export function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}

export function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </svg>
  )
}

export function TelegramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  )
}

export function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

export function SiteChatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export function ApiIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  )
}

export function StatusChip({ kind, label }: { kind: 'ok' | 'off' | 'soon' | 'warn'; label: string }) {
  const color = kind === 'ok' ? 'var(--nav-success)' : kind === 'warn' ? 'var(--nav-critical)' : 'var(--nav-text-muted)'
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full max-w-full" style={{ color, background: 'var(--nav-bg)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, opacity: kind === 'ok' || kind === 'warn' ? 1 : 0.5 }} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}

// MoonAI-style channel card (research §1.9): icon + name + status chip +
// description + action area. Shared shell; each channel supplies its own
// action buttons as children. `featured` -- крупная карточка WhatsApp в мастере.
export function ChannelCard({ icon, name, chip, description, children, featured = false }: {
  icon: ReactNode
  name: string
  chip: ReactNode
  description: string
  children?: ReactNode
  featured?: boolean
}) {
  return (
    <div className={`nav-glass nav-card-accent rounded-2xl flex flex-col min-w-0 ${featured ? 'p-5' : 'p-4'}`}>
      <div className={`flex items-center mb-2 ${featured ? 'gap-3' : 'gap-2.5'}`}>
        <div className={`${featured ? 'w-11 h-11' : 'w-9 h-9'} rounded-xl flex items-center justify-center flex-shrink-0`} style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={`${featured ? 'text-base' : 'text-sm'} font-semibold`} style={{ color: 'var(--nav-text-primary)' }}>{name}</div>
          <div className="mt-0.5">{chip}</div>
        </div>
      </div>
      <p className={`${featured ? 'text-sm' : 'text-xs'} mb-3 flex-1`} style={{ color: 'var(--nav-text-muted)' }}>{description}</p>
      {children}
    </div>
  )
}

// Loads Meta's JS SDK once (guarded against double-init across
// remounts/other pages via a window-level flag, same spirit as the
// Instagram OAuth notice's one-shot query-param strip). Unlike Instagram's
// redirect-based OAuth, WhatsApp Embedded Signup is a POPUP the SDK opens
// via FB.login -- nothing here navigates the page away.
//
// Экспортирована (B3): страница настроек и мастер зовут её сразу при
// монтировании, как раньше делала сама страница настроек, -- иначе SDK
// начинал грузиться только с открытием карточек, и первый быстрый клик по
// WhatsApp упирался в errWaSdkLoading. Повторный вызов ничего не делает.
export function ensureFacebookSdk(): void {
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
}

export interface ChannelCardsProps {
  agentId: string
  connections: AgentConnection[]
  setConnections: Dispatch<SetStateAction<AgentConnection[]>>
  layout?: 'settings' | 'wizard'
  // 'setup' -- Instagram OAuth вернёт в мастер, а не на «Каналы».
  returnTo?: 'setup'
  // Снять уведомление о прошлом возврате из Instagram (его показывает страница).
  onClearNotice?: () => void
  // Что показать в карточке подключённого WhatsApp (счётчик бесплатных ответов).
  whatsappExtra?: ReactNode
  // Канал только что подключён на этой странице (не через редирект).
  onConnected?: (channel: string) => void
}

export default function ChannelCards({
  agentId, connections, setConnections, layout = 'settings', returnTo, onClearNotice, whatsappExtra, onConnected,
}: ChannelCardsProps) {
  const { lang } = useLanguage()
  const t = aiAgentDict[lang]
  const tf = aiAgentFormsDict[lang]
  // Every confirm below is awaited: a Promise is truthy, so `if (confirm(...))`
  // would silently pass. See src/components/AppDialog.tsx.
  const { confirm, dialogElement } = useAppDialog()

  const [connecting, setConnecting] = useState(false)
  const [igBusy, setIgBusy] = useState(false)
  const [igError, setIgError] = useState<string | null>(null)
  const [telegramToken, setTelegramToken] = useState('')
  const [tgOpen, setTgOpen] = useState(false)
  const [tgBusy, setTgBusy] = useState(false)
  const [tgError, setTgError] = useState<string | null>(null)
  const [websiteBusy, setWebsiteBusy] = useState(false)
  const [websiteError, setWebsiteError] = useState<string | null>(null)
  const [websiteCopied, setWebsiteCopied] = useState(false)
  const [apiBusy, setApiBusy] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiCopied, setApiCopied] = useState(false)
  // The raw key only ever exists in memory, right after a (re)generate call --
  // it's never stored anywhere retrievable, so a page reload always loses it
  // even though the connection itself (apiConnection below) survives.
  const [apiKeyReveal, setApiKeyReveal] = useState<string | null>(null)
  // WhatsApp Embedded Signup (ES v4) -- a JS SDK popup, not a redirect, so
  // its result lands in refs (message-event listener + FB.login callback)
  // rather than a query-param round trip like the Instagram OAuth notice.
  const [waConnecting, setWaConnecting] = useState(false)
  const [waBusy, setWaBusy] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const waPhoneNumberIdRef = useRef<string | null>(null)
  const waWabaIdRef = useRef<string | null>(null)
  // What Meta's popup last told us (FINISH*/CANCEL/ERROR) and which of its
  // steps it was on. Refs, not state: they are read inside the FB.login
  // callback, which closes over the render it was created in.
  const waLastEventRef = useRef<string | null>(null)
  const waLastStepRef = useRef<string | null>(null)
  // The message listener below is registered once; the dictionary it uses
  // for error text is read through a ref so a language switch still applies.
  const tfRef = useRef(tf)
  useEffect(() => { tfRef.current = tf }, [tf])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  // На случай монтирования без страницы, которая уже позвала (идемпотентно).
  useEffect(() => { ensureFacebookSdk() }, [])

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
      // Meta's own docs list several completion event names beyond plain
      // FINISH -- FINISH_ONLY_WABA, FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING
      // (coexistence-linked numbers), FINISH_OBO_MIGRATION,
      // FINISH_GRANT_ONLY_API_ACCESS -- all carrying the same data shape.
      // Matching only the exact string 'FINISH' silently dropped every one
      // of these: phoneNumberIdRef/wabaIdRef never got set, so our own
      // connect callback was never even called.
      // Remember the last thing Meta told us, so the FB.login callback below
      // can tell "the user backed out" apart from "the popup died on Meta's
      // side" -- both of which otherwise arrive as simply "no code".
      if (typeof data.event === 'string') waLastEventRef.current = data.event
      if (typeof data.event === 'string' && data.event.startsWith('FINISH') && data.data) {
        if (data.data.phone_number_id) waPhoneNumberIdRef.current = data.data.phone_number_id
        if (data.data.waba_id) waWabaIdRef.current = data.data.waba_id
      } else if (data.event === 'CANCEL') {
        // Meta names the step the user was on when they closed it. Worth
        // keeping: "backed out on the phone-number screen" and "backed out on
        // the business-selection screen" are very different problems.
        waLastStepRef.current = data.data?.current_step || null
        setWaConnecting(false)
      } else if (data.event === 'ERROR') {
        setWaConnecting(false)
        // Meta puts the actual reason in the event. Showing it is the whole
        // point -- a generic "попробуйте ещё раз" for a failure that will
        // never succeed on a retry just costs the customer another attempt.
        const metaMessage = data.data?.error_message || data.data?.error_id
        waLastStepRef.current = data.data?.current_step || null
        setWaError(
          metaMessage
            ? tfRef.current.errMetaRejected(metaMessage, data.data?.current_step || '')
            : tfRef.current.errMetaRejectedNoReason
        )
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  async function connectInstagram() {
    setConnecting(true)
    onClearNotice?.()
    setIgError(null)
    try {
      const headers = await authHeader()
      // agentId rides along so the OAuth callback attaches the connection
      // to THIS agent (it travels inside the signed state param); returnTo
      // brings the browser back to the setup wizard when it started there.
      const qs = new URLSearchParams()
      if (agentId) qs.set('agentId', agentId)
      if (returnTo) qs.set('returnTo', returnTo)
      const query = qs.toString()
      const res = await fetch(`/api/ai-agent/instagram/connect${query ? `?${query}` : ''}`, { headers })
      if (res.ok) {
        const data = await res.json()
        window.location.href = data.authorizeUrl
      } else {
        // Say what actually went wrong. The WhatsApp channel spent a day
        // looking like a Meta problem because every failure showed the same
        // "try again" line; the one failure this route can produce on its own
        // -- a missing NEXT_PUBLIC_INSTAGRAM_APP_ID -- is a deploy setting no
        // amount of retrying fixes.
        const data = await res.json().catch(() => ({}) as any)
        setIgError(
          data?.error === 'Instagram app not configured'
            ? tf.errIgNotConfigured
            : tf.errIgOpen(data?.error || `HTTP ${res.status}`)
        )
        setConnecting(false)
      }
    } catch (e: any) {
      setIgError(tf.errIgOpen(e?.message || tf.errNetworkUnavailable))
      setConnecting(false)
    }
  }

  async function disconnectInstagram() {
    if (!agentId) return
    if (!(await confirm(tf.confirmDisconnectInstagram))) return
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
        onClearNotice?.()
      } else {
        setIgError(tf.errDisconnectInstagram)
      }
    } catch {
      setIgError(tf.errDisconnectInstagram)
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
        setConnections(prev => [...prev.filter(c => c.channel !== 'telegram'), { channel: 'telegram', external_account_id: '', external_account_name: data.botUsername, status: 'active' }])
        setTelegramToken('')
        setTgOpen(false)
        onConnected?.('telegram')
      } else {
        const data = await res.json().catch(() => null)
        setTgError(data?.error === 'invalid_token'
          ? tf.errConnectTelegramToken
          : tf.errConnectTelegram)
      }
    } catch {
      setTgError(tf.errConnectTelegram)
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
        setTgError(tf.errDisconnectTelegram)
      }
    } catch {
      setTgError(tf.errDisconnectTelegram)
    }
    setTgBusy(false)
  }

  async function connectWebsite() {
    if (!agentId) return
    setWebsiteBusy(true)
    setWebsiteError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/website/connect', {
        method: 'POST', headers, body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        const data = await res.json()
        setConnections(prev => [...prev.filter(c => c.channel !== 'website'), { channel: 'website', external_account_id: data.widgetKey, external_account_name: null, status: 'active' }])
        onConnected?.('website')
      } else {
        setWebsiteError(tf.errConnectWebsite)
      }
    } catch {
      setWebsiteError(tf.errConnectWebsite)
    }
    setWebsiteBusy(false)
  }

  async function disconnectWebsite() {
    if (!agentId) return
    setWebsiteBusy(true)
    setWebsiteError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/website/connect', {
        method: 'DELETE', headers, body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.channel !== 'website'))
      } else {
        setWebsiteError(tf.errDisconnectWebsite)
      }
    } catch {
      setWebsiteError(tf.errDisconnectWebsite)
    }
    setWebsiteBusy(false)
  }

  const instagramConnection = connections.find(c => c.channel === 'instagram')
  const telegramConnection = connections.find(c => c.channel === 'telegram')
  const whatsappConnection = connections.find(c => c.channel === 'whatsapp')
  const websiteConnection = connections.find(c => c.channel === 'website')
  const apiConnection = connections.find(c => c.channel === 'api')
  const tgExpanded = tgOpen || telegramConnection?.status === 'token_expired'

  function copyWidgetSnippet() {
    if (!websiteConnection) return
    const snippet = buildWidgetSnippet(websiteConnection.external_account_id)
    navigator.clipboard.writeText(snippet)
    setWebsiteCopied(true)
    setTimeout(() => setWebsiteCopied(false), 2000)
  }

  // Generates a fresh key on every call (no "existing key" concept -- see
  // external/connect/route.ts) -- used both for the first connect and for
  // the «Перегенерировать» button once already connected.
  async function connectApi() {
    if (!agentId) return
    setApiBusy(true)
    setApiError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/external/connect', {
        method: 'POST', headers, body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        const data = await res.json()
        setConnections(prev => [...prev.filter(c => c.channel !== 'api'), { channel: 'api', external_account_id: 'api', external_account_name: null, status: 'active' }])
        setApiKeyReveal(data.apiKey)
        setApiCopied(false)
        onConnected?.('api')
      } else {
        setApiError(tf.errConnectApi)
      }
    } catch {
      setApiError(tf.errConnectApi)
    }
    setApiBusy(false)
  }

  async function disconnectApi() {
    if (!agentId) return
    setApiBusy(true)
    setApiError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/external/connect', {
        method: 'DELETE', headers, body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.channel !== 'api'))
        setApiKeyReveal(null)
      } else {
        setApiError(tf.errDisconnectApi)
      }
    } catch {
      setApiError(tf.errDisconnectApi)
    }
    setApiBusy(false)
  }

  function copyApiKey() {
    if (!apiKeyReveal) return
    navigator.clipboard.writeText(apiKeyReveal)
    setApiCopied(true)
    setTimeout(() => setApiCopied(false), 2000)
  }

  // WhatsApp Embedded Signup: FB.login opens the popup; its callback fires
  // once the popup closes, carrying an auth `code`. The phone_number_id and
  // waba_id the user just created arrive separately via the message-event
  // listener above, usually slightly BEFORE the callback -- so a short poll
  // covers the rare race where the callback resolves first.
  // mode 'app' — номер уже зарегистрирован в приложении WhatsApp Business на
  // телефоне (Coexistence, Meta: featureType whatsapp_business_app_onboarding):
  // окно Meta показывает QR для привязки, номер остаётся и в приложении, и у
  // агента. Обычный режим ('new') — новый номер с кодом из SMS: для номера из
  // приложения Meta отвечает «номер зарегистрирован в существующем аккаунте».
  // Основная кнопка и «Переподключить» -- 'app' (у подключений нет признака,
  // каким путём они сделаны, а окно Meta само показывает нужный шаг).
  async function connectWhatsApp(mode: 'new' | 'app' = 'app') {
    if (!agentId) return
    const FB = (window as any).FB
    if (!FB) {
      setWaError(tf.errWaSdkLoading)
      return
    }
    // Both of these are inlined at build time. When one is missing the SDK is
    // handed an empty appId or config_id and Meta's popup dies on its own side
    // -- nothing reaches our server, so there is no log anywhere and every
    // symptom looks like "Meta refused us". Say it plainly instead.
    const waAppId = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID
    const waConfigId = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID
    if (!waAppId || !waConfigId) {
      setWaError(tf.errWaNotConfigured(
        [!waAppId && 'NEXT_PUBLIC_WHATSAPP_APP_ID', !waConfigId && 'NEXT_PUBLIC_WHATSAPP_CONFIG_ID']
          .filter(Boolean).join(tf.errWaEnvJoiner)
      ))
      return
    }
    setWaError(null)
    setWaConnecting(true)
    waPhoneNumberIdRef.current = null
    waWabaIdRef.current = null
    waLastEventRef.current = null

    FB.login((response: any) => {
      const code = response?.authResponse?.code
      if (!code) {
        setWaConnecting(false)
        // Backing out really is not an error, and CANCEL/ERROR already said
        // their piece. But a popup that ends with NO event at all and no code
        // is a genuine dead end -- and staying silent about it is exactly how
        // this arrived as "I just couldn't register, no message".
        const last = waLastEventRef.current
        if (!last) {
          setWaError(tf.errWaWindowClosed)
        } else if (last === 'CANCEL' && waLastStepRef.current) {
          setWaError(tf.errWaInterrupted(waLastStepRef.current))
        }
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
          setWaError(tf.errWaPhoneData)
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
              // Meta reports Coexistence with its own completion event. The
              // server needs it: a Coexistence number is ALREADY registered
              // for Cloud API, so registering it again fails.
              esEvent: waLastEventRef.current,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            setConnections(prev => [...prev.filter(c => c.channel !== 'whatsapp'), { channel: 'whatsapp', external_account_id: '', external_account_name: data.displayPhoneNumber || null, status: 'active' }])
            onConnected?.('whatsapp')
          } else {
            const data = await res.json().catch(() => ({}) as any)
            setWaError(
              data?.detail
                ? tf.errWaConnectDetail(data.detail)
                : tf.errWaConnect
            )
          }
        } catch (e: any) {
          setWaError(tf.errWaConnectDetail(e?.message || tf.errNetworkUnavailable))
        }
        setWaConnecting(false)
      })()
    }, {
      config_id: process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || '',
      response_type: 'code',
      override_default_response_type: true,
      extras: mode === 'app'
        ? { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' }
        : { setup: {} },
    })
  }

  async function disconnectWhatsApp() {
    if (!agentId) return
    if (!(await confirm(tf.confirmDisconnectWhatsapp))) return
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
        setWaError(tf.errDisconnectWhatsapp)
      }
    } catch {
      setWaError(tf.errDisconnectWhatsapp)
    }
    setWaBusy(false)
  }

  const featured = layout === 'wizard'

  const instagramCard = (
    <ChannelCard
      key="instagram"
      icon={<InstagramIcon />}
      name="Instagram"
      chip={instagramConnection?.status === 'active'
        ? <StatusChip kind="ok" label={t.chipConnected(instagramConnection.external_account_name || 'Instagram')} />
        : instagramConnection?.status === 'token_expired'
          ? <StatusChip kind="warn" label={t.chipReconnectNeeded} />
          : <StatusChip kind="off" label={t.chipNotConnected} />}
      description={t.channelInstagramDesc}
    >
      {/* Open to every Pro customer since 2026-09-07: App Review
          granted instagram_business_basic and
          instagram_business_manage_messages Advanced Access, so
          this no longer only works for people with a role on the
          Meta app. WhatsApp got the same treatment on 2026-10-12:
          public_profile reached Advanced Access with the
          submission approved ~14.09 (verified via Meta DevTools),
          so its UI gate below was lifted too -- the server-side
          callback already allowed any active Pro plan. */}
      {instagramConnection?.status === 'active' && (
        <button onClick={disconnectInstagram} disabled={igBusy}
          className="w-full nav-glass rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ color: 'var(--nav-text-primary)' }}>
          {igBusy ? t.disconnecting : t.disconnectButton}
        </button>
      )}
      {instagramConnection?.status === 'token_expired' && (
        <>
          <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--nav-critical)' }}>
            <WarnIcon /> {t.instagramExpiredHint}
          </div>
          <button onClick={connectInstagram} disabled={connecting}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--nav-critical)', color: '#fff' }}>
            {connecting ? t.openingInstagram : t.reconnectButton}
          </button>
        </>
      )}
      {!instagramConnection && (
        <button onClick={connectInstagram} disabled={connecting}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {connecting ? t.openingInstagram : t.connectButton}
        </button>
      )}
      {igError && (
        <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{igError}</div>
      )}
    </ChannelCard>
  )

  const telegramCard = (
    <ChannelCard
      key="telegram"
      icon={<TelegramIcon />}
      name={tf.channelTelegramName}
      chip={telegramConnection?.status === 'active'
        ? <StatusChip kind="ok" label={t.chipConnected(`@${telegramConnection.external_account_name || 'bot'}`)} />
        : telegramConnection?.status === 'token_expired'
          ? <StatusChip kind="warn" label={t.chipReconnectNeeded} />
          : <StatusChip kind="off" label={t.chipNotConnected} />}
      description={t.channelTelegramDesc}
    >
      {telegramConnection?.status === 'active' ? (
        <button onClick={disconnectTelegram} disabled={tgBusy}
          className="w-full nav-glass rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ color: 'var(--nav-text-primary)' }}>
          {tgBusy ? t.disconnecting : t.disconnectButton}
        </button>
      ) : tgExpanded ? (
        <>
          {telegramConnection?.status === 'token_expired' && (
            <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--nav-critical)' }}>
              <WarnIcon /> {tf.telegramExpiredHint}
            </div>
          )}
          <p className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
            {tf.telegramSetupHint}
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
              {tgBusy ? tf.connectingButton : t.connectButton}
            </button>
            {telegramConnection?.status !== 'token_expired' && (
              <button onClick={() => { setTgOpen(false); setTgError(null) }} disabled={tgBusy}
                className="rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                {tf.cancelButton}
              </button>
            )}
          </div>
        </>
      ) : (
        <button onClick={() => setTgOpen(true)}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {t.connectButton}
        </button>
      )}
      {tgError && (
        <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{tgError}</div>
      )}
    </ChannelCard>
  )

  const whatsappCard = (
    <ChannelCard
      key="whatsapp"
      featured={featured}
      icon={<WhatsAppIcon size={featured ? 22 : 18} />}
      name="WhatsApp"
      chip={whatsappConnection?.status === 'active'
        ? <StatusChip kind="ok" label={t.chipConnected(whatsappConnection.external_account_name || 'WhatsApp')} />
        : whatsappConnection?.status === 'token_expired'
          ? <StatusChip kind="warn" label={t.chipReconnectNeeded} />
          : <StatusChip kind="off" label={t.chipNotConnected} />}
      description={t.channelWhatsappDesc}
    >
      <>
      {whatsappConnection?.status === 'active' && whatsappExtra}
      {whatsappConnection?.status === 'active' && (
        <button onClick={disconnectWhatsApp} disabled={waBusy}
          className="w-full nav-glass rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ color: 'var(--nav-text-primary)' }}>
          {waBusy ? t.disconnecting : t.disconnectButton}
        </button>
      )}
      {whatsappConnection?.status === 'token_expired' && (
        <>
          <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--nav-critical)' }}>
            <WarnIcon /> {tf.whatsappExpiredHint}
          </div>
          <button onClick={() => connectWhatsApp('app')} disabled={waConnecting}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--nav-critical)', color: '#fff' }}>
            {waConnecting ? tf.openingWhatsapp : t.reconnectButton}
          </button>
        </>
      )}
      {!whatsappConnection && (
        <>
          {/* Основной путь -- номер уже в приложении WhatsApp Business на
              телефоне (у большинства продавцов так): QR, приложение
              продолжает работать. Обычный режим для нового номера по SMS на
              этом номере всегда упирался в «номер зарегистрирован в
              существующем аккаунте» (проверено вживую 18.10.2026), поэтому он
              вторичный. */}
          <button onClick={() => connectWhatsApp('app')} disabled={waConnecting}
            className={`w-full rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${featured ? 'py-3' : 'py-2.5'}`}
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', ...(featured ? { boxShadow: '0 10px 24px -10px var(--nav-accent)' } : {}) }}>
            {waConnecting ? tf.connectingButton : tf.connectExistingAppButton}
          </button>
          <div className="text-xs mt-1.5" style={{ color: 'var(--nav-text-secondary)' }}>{tf.connectExistingAppHint}</div>
          <button onClick={() => connectWhatsApp('new')} disabled={waConnecting}
            className="self-start text-xs font-medium underline underline-offset-2 mt-2 py-1 text-left disabled:opacity-50"
            style={{ color: 'var(--nav-text-primary)' }}>
            {tf.connectNewNumberButton}
          </button>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{tf.connectNewNumberHint}</div>
        </>
      )}
      {waError && (
        <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{waError}</div>
      )}
      </>
    </ChannelCard>
  )

  const websiteCard = (
    <ChannelCard
      key="website"
      icon={<SiteChatIcon />}
      name={tf.channelWebsiteName}
      chip={websiteConnection
        ? <StatusChip kind="ok" label={tf.connectedChip} />
        : <StatusChip kind="off" label={t.chipNotConnected} />}
      description={t.channelWebsiteDesc}
    >
      {websiteConnection ? (
        <>
          <p className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
            {tf.websiteEmbedHint}
          </p>
          <code className="block text-[10px] mb-2 p-2 rounded-lg break-all" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
            {buildWidgetSnippet(websiteConnection.external_account_id)}
          </code>
          <div className="flex gap-2">
            <button onClick={copyWidgetSnippet}
              className="flex-1 text-xs font-semibold nav-glass rounded-lg px-3 py-2" style={{ color: 'var(--nav-accent)' }}>
              {websiteCopied ? tf.copiedLabel : tf.copyCodeButton}
            </button>
            <button onClick={disconnectWebsite} disabled={websiteBusy}
              className="nav-glass rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
              {websiteBusy ? '…' : t.disconnectButton}
            </button>
          </div>
        </>
      ) : (
        <button onClick={connectWebsite} disabled={websiteBusy}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {websiteBusy ? tf.connectingButton : t.connectButton}
        </button>
      )}
      {websiteError && (
        <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{websiteError}</div>
      )}
    </ChannelCard>
  )

  const apiCard = (
    <ChannelCard
      key="api"
      icon={<ApiIcon />}
      name="API"
      chip={apiConnection
        ? <StatusChip kind="ok" label={tf.connectedChip} />
        : <StatusChip kind="off" label={t.chipNotConnected} />}
      description={t.channelApiDesc}
    >
      {apiKeyReveal && (
        <>
          <p className="text-[11px] mb-2" style={{ color: 'var(--nav-critical)' }}>
            {tf.apiKeyOnceHint}
          </p>
          <code className="block text-[10px] mb-2 p-2 rounded-lg break-all" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
            {apiKeyReveal}
          </code>
          <button onClick={copyApiKey}
            className="w-full mb-2 text-xs font-semibold nav-glass rounded-lg px-3 py-2" style={{ color: 'var(--nav-accent)' }}>
            {apiCopied ? tf.copiedLabel : tf.copyKeyButton}
          </button>
          <p className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
            {tf.apiUsageSend} <code>POST /api/ai-agent/external/message</code> {tf.apiUsageWithHeader} <code>Authorization: Bearer {tf.apiKeyWord}</code>. {tf.apiUsageReceive} <code>GET /api/ai-agent/external/messages</code>.
          </p>
        </>
      )}
      {apiConnection ? (
        <div className="flex gap-2">
          <button onClick={connectApi} disabled={apiBusy}
            className="flex-1 text-xs font-semibold nav-glass rounded-lg px-3 py-2 disabled:opacity-50" style={{ color: 'var(--nav-accent)' }}>
            {apiBusy ? '…' : tf.regenerateKeyButton}
          </button>
          <button onClick={disconnectApi} disabled={apiBusy}
            className="nav-glass rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
            {apiBusy ? '…' : t.disconnectButton}
          </button>
        </div>
      ) : (
        <button onClick={connectApi} disabled={apiBusy}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {apiBusy ? tf.connectingButton : t.connectButton}
        </button>
      )}
      {apiError && (
        <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{apiError}</div>
      )}
    </ChannelCard>
  )

  if (layout === 'wizard') {
    return (
      <>
        <div className="space-y-3">
          {whatsappCard}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {instagramCard}
            {telegramCard}
            {websiteCard}
          </div>
        </div>
        {dialogElement}
      </>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
        {instagramCard}
        {telegramCard}
        {whatsappCard}
        {websiteCard}
        {apiCard}
      </div>
      {dialogElement}
    </>
  )
}
