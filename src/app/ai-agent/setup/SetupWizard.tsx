'use client'
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import PageHeader from '@/components/PageHeader'
import PageContainer from '@/components/PageContainer'
import BrandLoader from '@/components/BrandLoader'
import AiAgentProUpsell from '@/components/aiAgent/AiAgentProUpsell'
import ChannelCards, { WarnIcon, ensureFacebookSdk, type AgentConnection } from '@/components/aiAgent/ChannelCards'
import TestChatPanel from '@/components/aiAgent/TestChatPanel'
import WhatsAppUsage, { NAV_WARNING } from '@/components/aiAgent/WhatsAppUsage'
import { useLanguage } from '@/components/LanguageProvider'
import { aiAgentDict } from '@/lib/i18n/aiAgent'
import { aiAgentFormsDict } from '@/lib/i18n/aiAgentForms'
import { aiAgentSetupDict } from '@/lib/i18n/aiAgentSetup'
import { hasAiAgentPlan, AI_AGENT_PROFILE_COLUMNS } from '@/lib/aiAgent/planGate'
import { summarizeConnections, type AgentChannel } from '@/lib/aiAgent/connectedChannels'
import {
  canUseSetupWizard, businessStepComplete, canLaunch, canGoNext, resumeStep, parseStepParam,
  hasWorkingChannel, maxReachableStep, clampStep, DEFAULT_LAUNCH_MODE, MIN_BUSINESS_DESCRIPTION_CHARS,
  type LaunchMode, type SetupStep,
} from '@/lib/aiAgent/setupWizard'

// Мастер «сначала канал» /ai-agent/setup (16.10.2026, решения основателя от
// 15.10). Шаги: 0 «Создать» → 1 «Канал» → 2 «О бизнесе» → 3 «Проверка» →
// 4 «Запуск». Агент создаётся сразу, но выключенным: клиентам он не
// отвечает, пока владелец не нажмёт «Запустить» (агент-черновик молчит во
// всех пяти обработчиках входящих -- они проверяют is_enabled). Пока
// только для админов (решение 4) -- остальные Про идут прежним путём через
// /ai-agent/settings?new=1. Тонкая настройка (тон, цель, сбор данных,
// шаблоны, сценарии, Meta CAPI, API) -- во вкладках настроек, у всего уже
// есть значения по умолчанию.
//
// Состояние шага -- в ?agent=…&step=… через history API (как на странице
// настроек: router.replace для смены одного query в этом приложении
// ненадёжен), чтобы обновление страницы и возврат из Instagram OAuth
// (callback ведёт сюда же, ?step=2) открывали нужный шаг. Каждый переход --
// pushState (B11): «Назад» браузера возвращает на прошлый шаг, а не
// закрывает мастер; popstate синхронизирует шаг. ?step= всегда прижимается
// к допустимому (B10): шаги 3–4 -- только с описанием от 80 символов или
// Kaspi Bot.

const EASE = [0.16, 1, 0.3, 1] as const

// = AI_AGENT_CREDIT_PRICE_TENGE × AI_AGENT_CREDITS_PER_AI_REPLY
// (src/lib/aiAgent/wallet.ts тянет service-role клиент и в клиентский бандл
// не годится) -- тот же приём, что в settings/page.tsx и TestChatPanel.tsx.
const REPLY_PRICE_TENGE = 5

// После «Пополнить» баланс приходит не сразу: оплату подтверждает Kaspi, и
// кошелёк в боковой панели о зачислении никому не сообщает. Поэтому шаг
// «Запуск» сам перечитывает баланс, пока не увидит рост (B9).
const TOPUP_POLL_MS = 8000
const TOPUP_WATCH_MS = 10 * 60 * 1000

// Ключи «сходи и вернись» (crossProduct.ts) -- переживают смену шага (B13).
const HANDOFF_KEYS = ['from', 'back'] as const

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

// Поля агента, которые POST /api/ai-agent/settings перезаписывает целиком --
// мастер отправляет их обратно такими, какими получил, меняя только
// название, описание и магазин.
type LoadedAgent = {
  id: string
  name: string
  tone: string
  businessDescription: string
  goal: string
  collectFields: string[]
  timezone: string
  currency: string
  customInstructions: string
  stopPhrases: string[]
  historyPairs: number
  kaspiShopConnectionId: string | null
  // «Не использовать магазин Kaspi», выставленный в настройках: сервер тогда не
  // считает магазин источником знаний (запуск), и мастер не должен считать.
  kaspiCatalogOff: boolean
  isEnabled: boolean
  isDraft: boolean
  launchedAt: string | null
}

type KaspiShop = { id: string; name: string; isActive: boolean }

const VISIBLE_STEPS: SetupStep[] = [1, 2, 3, 4]

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m5 12 5 5L20 7" />
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

export default function SetupWizard() {
  const router = useRouter()
  const { lang } = useLanguage()
  const s = aiAgentSetupDict[lang]
  const t = aiAgentDict[lang]
  const tf = aiAgentFormsDict[lang]
  const reduceMotion = !!useReducedMotion()

  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [step, setStep] = useState<SetupStep>(0)
  const [agent, setAgent] = useState<LoadedAgent | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kaspiShops, setKaspiShops] = useState<KaspiShop[]>([])
  const [kaspiShopConnectionId, setKaspiShopConnectionId] = useState('')
  const [connections, setConnections] = useState<AgentConnection[]>([])
  const [justConnected, setJustConnected] = useState(false)
  const [igNotice, setIgNotice] = useState<'connected' | 'error' | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [mode, setMode] = useState<LaunchMode>(DEFAULT_LAUNCH_MODE)
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  // Пополнение начато (B9): время клика и баланс в тот момент.
  const [topUpWatch, setTopUpWatch] = useState<{ since: number; balance: number | null } | null>(null)
  const topUpWatchRef = useRef<{ since: number; balance: number | null } | null>(null)
  // Фокус и прокрутка нового шага (B4): ставится в goTo, срабатывает в
  // callback-ref заголовка, когда новый шаг РЕАЛЬНО смонтирован (при
  // AnimatePresence mode="wait" это после анимации ухода старого).
  const focusOnMountRef = useRef(false)
  const creatingRef = useRef(false)
  // Страницу уже увели (router.replace) -- загрузчик не снимает лоадер.
  const leavingRef = useRef(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  // Адрес = источник правды для обновления страницы: ?agent=…&step=….
  // 'push' -- переход между шагами (для «Назад» браузера), 'replace' --
  // первая загрузка и только что созданный черновик.
  function pinUrl(agentId: string | null, nextStep: SetupStep, how: 'push' | 'replace' = 'replace') {
    const current = new URLSearchParams(window.location.search)
    const params = new URLSearchParams()
    if (agentId) params.set('agent', agentId)
    if (agentId && nextStep > 0) params.set('step', String(nextStep))
    for (const k of HANDOFF_KEYS) { const v = current.get(k); if (v) params.set(k, v) }
    const qs = params.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    if (how === 'push') {
      if (url !== `${window.location.pathname}${window.location.search}`) window.history.pushState({ setupStep: nextStep }, '', url)
    } else {
      window.history.replaceState({ setupStep: nextStep }, '', url)
    }
  }

  const goTo = useCallback((nextStep: SetupStep, agentId?: string | null, how: 'push' | 'replace' = 'push') => {
    setStep(nextStep)
    pinUrl(agentId ?? agent?.id ?? null, nextStep, how)
    setSaveError(false)
    setLaunchError(null)
    focusOnMountRef.current = true
  }, [agent?.id])

  // Заголовок нового шага: фокус (клавиатура и скринридер) и наверх. На
  // компьютере прокручивается не окно, а .desktop-shell-scroll (DesktopShell).
  const headingRef = useCallback((el: HTMLHeadingElement | null) => {
    if (!el || !focusOnMountRef.current) return
    focusOnMountRef.current = false
    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth'
    const container = el.closest('.desktop-shell-scroll') as HTMLElement | null
    if (container && container.scrollHeight > container.clientHeight) container.scrollTo({ top: 0, behavior })
    window.scrollTo({ top: 0, behavior })
    el.focus({ preventScroll: true })
  }, [reduceMotion])

  const loadWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-agent/wallet', { headers: await authHeader() })
      if (res.ok) {
        const data = await res.json()
        if (typeof data.balance === 'number') {
          setWalletBalance(data.balance)
          // Баланс вырос после «Пополнить» -- опрос больше не нужен (B9).
          const watch = topUpWatchRef.current
          if (watch && (watch.balance === null || data.balance > watch.balance)) {
            topUpWatchRef.current = null
            setTopUpWatch(null)
          }
        }
      }
    } catch { /* баланс просто не показывается */ }
  }, [])

  // Загружает агента для шагов 1–4. Возвращает false, если страницу уже
  // увели (чужой/удалённый агент, уже запущенный агент).
  const loadAgent = useCallback(async (agentId: string): Promise<{ agent: LoadedAgent; connections: AgentConnection[]; kaspiShops: KaspiShop[] } | null> => {
    let data: any
    try {
      const res = await fetch(`/api/ai-agent/settings?agentId=${encodeURIComponent(agentId)}`, { headers: await authHeader() })
      if (res.status === 404) { leavingRef.current = true; router.replace('/ai-agent'); return null }
      if (!res.ok) { setLoadError(true); return null }
      data = await res.json()
    } catch {
      // Сеть/разбор ответа: без try мастер навсегда оставался на лоадере (B1).
      setLoadError(true)
      return null
    }
    const a = data?.agent
    if (!a) { setLoadError(true); return null }
    const loaded: LoadedAgent = {
      id: a.id,
      name: a.name || '',
      tone: a.tone,
      businessDescription: a.businessDescription || '',
      goal: a.goal,
      collectFields: Array.isArray(a.collectFields) ? a.collectFields : [],
      timezone: a.timezone || 'Asia/Almaty',
      currency: a.currency || 'KZT',
      customInstructions: a.customInstructions || '',
      stopPhrases: Array.isArray(a.stopPhrases) ? a.stopPhrases : [],
      historyPairs: typeof a.historyPairs === 'number' ? a.historyPairs : 5,
      kaspiShopConnectionId: a.kaspiShopConnectionId || null,
      kaspiCatalogOff: a.kaspiCatalogOff === true,
      isEnabled: a.isEnabled !== false,
      isDraft: !!a.isDraft,
      launchedAt: a.launchedAt || null,
    }
    // Уже запущенный агент мастеру не нужен -- его место в настройках. До
    // миграции launched_at нет: тогда «запущен» = включён (черновик мастера
    // создаётся выключенным).
    const alreadyLaunched = !!loaded.launchedAt || (!loaded.isDraft && loaded.isEnabled)
    if (alreadyLaunched) { leavingRef.current = true; router.replace(`/ai-agent/settings?agent=${encodeURIComponent(loaded.id)}`); return null }
    return { agent: loaded, connections: data.connections || [], kaspiShops: data.kaspiShops || [] }
  }, [router])

  function applyLoaded(loaded: { agent: LoadedAgent; connections: AgentConnection[]; kaspiShops: KaspiShop[] }) {
    setAgent(loaded.agent)
    setName(loaded.agent.name)
    setDescription(loaded.agent.businessDescription)
    setKaspiShopConnectionId(loaded.agent.kaspiShopConnectionId || '')
    setConnections(loaded.connections)
    setKaspiShops(loaded.kaspiShops)
  }

  // SDK Meta для WhatsApp -- сразу, а не когда смонтируются карточки (B3):
  // иначе первый быстрый клик по WhatsApp упирался в «SDK ещё грузится».
  useEffect(() => { ensureFacebookSdk() }, [])

  useEffect(() => {
    let alive = true
    // Адрес читается сразу, до await: HandoffBanner в layout убирает from/back
    // из адреса при монтировании.
    const params = new URLSearchParams(window.location.search)
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { leavingRef.current = true; router.push('/login'); return }
      const agentParam = params.get('agent')
      const { data: profile } = await supabase.from('profiles').select(AI_AGENT_PROFILE_COLUMNS).eq('id', user.id).single()
      if (!alive) return
      if (!hasAiAgentPlan(profile)) { setForbidden(true); return }
      // Мастер только для админов (решение 4): остальные -- прежний путь.
      if (!canUseSetupWizard(!!profile?.is_admin)) {
        leavingRef.current = true
        const target = new URLSearchParams()
        if (agentParam) target.set('agent', agentParam)
        else target.set('new', '1')
        for (const k of HANDOFF_KEYS) { const v = params.get(k); if (v) target.set(k, v) }
        router.replace(`/ai-agent/settings?${target.toString()}`)
        return
      }

      // Возврат из Instagram OAuth: показать итог один раз и убрать флаг из адреса.
      if (params.has('instagram_connected')) setIgNotice('connected')
      else if (params.has('instagram_error')) setIgNotice('error')

      loadWallet()
      if (!agentParam) {
        setStep(0)
        return
      }
      const loaded = await loadAgent(agentParam)
      if (!alive || !loaded) return
      // Черновик, созданный ещё старой формой (до мастера), включён
      // (is_enabled = true), просто пока без канала -- так у четырёх агентов
      // на 16.10. Подключи ему канал в мастере, и он ответил бы клиенту до
      // «Запустить». Без канала выключение ни на кого не влияет, поэтому
      // мастер приводит такой черновик к правилу «молчит до запуска».
      if (loaded.agent.isEnabled && !hasWorkingChannel(loaded.connections)) {
        try {
          const res = await fetch(`/api/ai-agent/agents/${encodeURIComponent(loaded.agent.id)}`, {
            method: 'PATCH', headers: await authHeader(), body: JSON.stringify({ isEnabled: false }),
          })
          if (res.ok) loaded.agent.isEnabled = false
        } catch { /* best-effort: запуск всё равно включит агента явно */ }
      }
      applyLoaded(loaded)
      const hasShop = !loaded.agent.kaspiCatalogOff && loaded.kaspiShops.some(sh => sh.isActive || sh.id === loaded.agent.kaspiShopConnectionId)
      // ?step= прижимается к допустимому (B10): ?step=3/4 без описания от 80
      // символов (или Kaspi Bot) ведёт на шаг 2.
      const initial = clampStep(
        parseStepParam(params.get('step')),
        maxReachableStep({ name: loaded.agent.name, description: loaded.agent.businessDescription, hasKaspiShop: hasShop }),
        resumeStep({ connections: loaded.connections, description: loaded.agent.businessDescription, hasKaspiShop: hasShop }),
      )
      setStep(initial)
      pinUrl(loaded.agent.id, initial)
    }
    load()
      .catch(() => { if (alive) setLoadError(true) })
      // Лоадер снимается всегда, кроме ухода со страницы (B1): раньше любой
      // сбой загрузки оставлял мастер на лоадере навсегда.
      .finally(() => { if (alive && !leavingRef.current) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Баланс мог измениться в кошельке (пополнение в боковой панели) -- шаг
  // «Запуск» перечитывает его, когда окно снова в фокусе.
  useEffect(() => {
    if (step !== 4) return
    loadWallet()
    const onFocus = () => loadWallet()
    const onVisible = () => { if (document.visibilityState === 'visible') loadWallet() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [step, loadWallet])

  // После «Пополнить» (B9): опрашиваем баланс, пока он не вырос или не
  // прошло 10 минут; на скрытой вкладке не опрашиваем.
  useEffect(() => {
    if (step !== 4 || !topUpWatch) return
    const timer = window.setInterval(() => {
      if (Date.now() - topUpWatch.since > TOPUP_WATCH_MS) { topUpWatchRef.current = null; setTopUpWatch(null); return }
      if (document.visibilityState === 'visible') loadWallet()
    }, TOPUP_POLL_MS)
    return () => window.clearInterval(timer)
  }, [step, topUpWatch, loadWallet])

  function openTopUp() {
    const watch = { since: Date.now(), balance: walletBalance }
    topUpWatchRef.current = watch
    setTopUpWatch(watch)
    window.dispatchEvent(new Event('open-wallet-panel'))
  }

  async function createDraft() {
    // Ref, а не только state: два быстрых клика в одном кадре оба видели
    // creating = false и создавали два черновика (B1).
    if (creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    setCreateError(false)
    try {
      const res = await fetch('/api/ai-agent/settings', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ draft: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.agent?.id) throw new Error('create failed')
      // Черновик уже есть -- сразу в адрес (replace: «Назад» не должен
      // вернуть на «Создать» и создать второй), чтобы обновление страницы
      // продолжило его, даже если загрузка ниже не удастся.
      pinUrl(data.agent.id, 1, 'replace')
      const loaded = await loadAgent(data.agent.id)
      if (!loaded) return
      applyLoaded(loaded)
      goTo(1, loaded.agent.id, 'replace')
    } catch {
      setCreateError(true)
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }

  // Активный магазин аккаунта или закреплённый за агентом -- тогда каталог
  // реально попадает в ответы (catalogContext.ts).
  const pinnedShop = kaspiShops.find(sh => sh.id === kaspiShopConnectionId) || null
  const activeShop = kaspiShops.find(sh => sh.isActive) || null
  const effectiveShop = agent?.kaspiCatalogOff ? null : (pinnedShop || activeShop)
  const hasKaspiShop = !!effectiveShop

  // «Назад»/«Вперёд» браузера (B11): шаг берётся из адреса и прижимается к
  // допустимому по СОХРАНЁННЫМ названию и описанию (B10).
  useEffect(() => {
    if (!agent) return
    const current = agent
    const savedHasShop = !current.kaspiCatalogOff && kaspiShops.some(sh => sh.isActive || sh.id === current.kaspiShopConnectionId)
    function onPop() {
      const params = new URLSearchParams(window.location.search)
      if (params.get('agent') !== current.id) { window.location.reload(); return }
      const max = maxReachableStep({ name: current.name, description: current.businessDescription, hasKaspiShop: savedHasShop })
      const next = clampStep(parseStepParam(params.get('step')), max, 1)
      setStep(next)
      setSaveError(false)
      setLaunchError(null)
      focusOnMountRef.current = true
      if (`${next}` !== params.get('step')) pinUrl(current.id, next, 'replace')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [agent, kaspiShops])

  async function saveBusiness(): Promise<boolean> {
    if (!agent) return false
    setSaving(true)
    setSaveError(false)
    let ok = false
    try {
      const res = await fetch('/api/ai-agent/settings', {
        method: 'POST',
        headers: await authHeader(),
        // is_enabled здесь не отправляется: POST с agentId его не трогает,
        // агент остаётся выключенным до «Запустить».
        body: JSON.stringify({
          agentId: agent.id,
          name: name.trim(),
          tone: agent.tone,
          businessDescription: description,
          goal: agent.goal,
          collectFields: agent.collectFields,
          timezone: agent.timezone,
          currency: agent.currency,
          customInstructions: agent.customInstructions,
          historyPairs: agent.historyPairs,
          stopPhrases: agent.stopPhrases,
          kaspiShopConnectionId: kaspiShopConnectionId || null,
        }),
      })
      ok = res.ok
      if (ok) setAgent(prev => prev ? { ...prev, name: name.trim(), businessDescription: description, kaspiShopConnectionId: kaspiShopConnectionId || null } : prev)
    } catch {
      ok = false
    }
    setSaving(false)
    if (!ok) setSaveError(true)
    return ok
  }

  async function next() {
    if (step === 2) {
      if (!canGoNext(2, { description, hasKaspiShop, name })) return
      if (!(await saveBusiness())) return
    }
    if (step < 4) goTo((step + 1) as SetupStep)
  }

  async function launch() {
    if (!agent || launching || !canLaunch(connections)) return
    setLaunching(true)
    setLaunchError(null)
    try {
      const res = await fetch(`/api/ai-agent/agents/${encodeURIComponent(agent.id)}/launch`, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ mode }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setLaunchError(data?.error === 'no_channel' ? s.launchNeedsChannel : data?.error === 'needs_business' ? s.launchNeedsBusiness : s.launchError)
        setLaunching(false)
        return
      }
      router.push('/ai-agent/overview')
    } catch {
      setLaunchError(s.launchError)
      setLaunching(false)
    }
  }

  if (loading) return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <BrandLoader />
      </main>
    </DesktopShell>
  )

  if (forbidden) return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <AiAgentProUpsell title={s.pageTitle} />
      </main>
    </DesktopShell>
  )

  const channelSummary = summarizeConnections(connections)
  const descLen = description.trim().length
  const lowBalance = walletBalance !== null && walletBalance < REPLY_PRICE_TENGE
  const whatsappConnected = connections.some(c => c.channel === 'whatsapp' && c.status === 'active')
  const channelLabel = (ch: AgentChannel) =>
    ch === 'website' ? t.channelWebsite : ch === 'api' ? t.channelApi : ch === 'whatsapp' ? 'WhatsApp' : ch === 'instagram' ? 'Instagram' : 'Telegram'

  const primaryBtn = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed'
  const primaryStyle = { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }
  const secondaryBtn = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium nav-glass disabled:opacity-50'

  // «Тонкая настройка» с шага 2 сначала сохраняет название и описание (B8):
  // иначе набранный текст терялся при переходе. Не сохранилось -- остаёмся
  // и показываем ошибку сохранения.
  const fineTuneHref = agent ? `/ai-agent/settings?agent=${encodeURIComponent(agent.id)}` : '/ai-agent'
  const businessDirty = !!agent && (
    name.trim() !== agent.name || description !== agent.businessDescription || (kaspiShopConnectionId || null) !== agent.kaspiShopConnectionId
  )
  async function openFineTune(e: ReactMouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (step !== 2 || !businessDirty) return
    e.preventDefault()
    if (saving) return
    if (await saveBusiness()) router.push(fineTuneHref)
  }
  const fineTune = agent && step >= 2 && (
    <p className="text-xs mt-6 text-center" style={{ color: 'var(--nav-text-muted)' }}>
      {s.fineTuneText}{' '}
      <Link href={fineTuneHref} onClick={openFineTune} aria-disabled={saving || undefined} className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
        {s.fineTuneLink} →
      </Link>
    </p>
  )

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <PageContainer variant="wide" align="start" className="pb-6">
          {/* Название страницы -- h1 шапки (оно же название вкладки); заголовки шагов ниже -- h2 с фокусом при смене шага. */}
          <PageHeader title={s.pageTitle} backHref="/ai-agent" />

          {/* Мастер -- один узкий поток внутри общей рамки раздела (wide), как формы настроек. */}
          <div className="max-w-2xl">

          {/* Полоса прогресса: шаги 1–4 (шаг 0 -- вход, до него агента нет). */}
          {step > 0 && (
            <nav aria-label={s.pageTitle} className="mb-5">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>
                  {s.stepOf(step, VISIBLE_STEPS.length)}
                  <span className="sm:hidden" aria-hidden style={{ color: 'var(--nav-text-muted)' }}>{' · '}{s.stepLabels[step]}</span>
                </span>
                {agent && <span className="text-xs truncate min-w-0" style={{ color: 'var(--nav-text-muted)' }}>{agent.name}</span>}
              </div>
              <ol className="grid grid-cols-4 gap-1.5">
                {VISIBLE_STEPS.map(n => {
                  const done = n < step
                  const current = n === step
                  return (
                    <li key={n} aria-current={current ? 'step' : undefined} className="min-w-0">
                      <div className="h-1.5 rounded-full" style={{ background: done || current ? 'var(--nav-accent)' : 'var(--nav-border)', opacity: done ? 0.55 : 1 }} />
                      {/* На телефоне подпись только для скринридера (B7). */}
                      <div className="sr-only sm:not-sr-only sm:block text-[11px] mt-1.5 truncate font-medium" style={{ color: current ? 'var(--nav-text-primary)' : 'var(--nav-text-muted)' }}>
                        {s.stepLabels[n]}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </nav>
          )}

          {loadError && (
            <div role="alert" className="rounded-xl px-3.5 py-2.5 mb-4 text-sm" style={{ background: 'var(--nav-bg)', color: 'var(--nav-critical)' }}>{s.loadError}</div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={step}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6, transition: { duration: 0.15, ease: EASE } }}
              transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
            >
              {step === 0 && !loadError && (
                <div className="nav-glass nav-card-accent rounded-2xl p-6 sm:p-8 text-center">
                  <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-2xl" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }} aria-hidden>
                    <BotIcon />
                  </div>
                  <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold mb-2 outline-none" style={{ color: 'var(--nav-text-primary)' }}>{s.step0Title}</h2>
                  <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--nav-text-secondary)' }}>{s.step0Text}</p>
                  <button onClick={createDraft} disabled={creating} className={primaryBtn} style={primaryStyle}>
                    {creating ? s.creating : s.createButton}
                  </button>
                  <div role="status" aria-live="polite" className="min-h-[1.25rem] mt-3 text-xs">
                    {createError && <span style={{ color: 'var(--nav-critical)' }}>{s.createError}</span>}
                  </div>
                </div>
              )}

              {step === 1 && agent && (
                <div>
                  <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold mb-1 outline-none" style={{ color: 'var(--nav-text-primary)' }}>{s.step1Title}</h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>{s.step1Text}</p>
                  {igNotice === 'error' && (
                    <div role="alert" className="rounded-xl px-3.5 py-2.5 mb-3 text-sm" style={{ background: 'var(--nav-bg)', color: 'var(--nav-critical)' }}>{tf.errConnectInstagram}</div>
                  )}
                  <ChannelCards
                    agentId={agent.id}
                    connections={connections}
                    setConnections={setConnections}
                    layout="wizard"
                    returnTo="setup"
                    onClearNotice={() => setIgNotice(null)}
                    onConnected={() => setJustConnected(true)}
                    whatsappExtra={<WhatsAppUsage agentId={agent.id} />}
                  />
                  <div role="status" aria-live="polite" className="min-h-[1.25rem] mt-3 text-sm">
                    {justConnected && hasWorkingChannel(connections) && (
                      <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--nav-success)' }}><CheckIcon /> {s.channelConnectedNote}</span>
                    )}
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-3">
                    <button onClick={() => goTo(2)} className="text-sm font-medium text-left underline-offset-2 hover:underline" style={{ color: 'var(--nav-text-secondary)' }}>
                      {s.laterLink}
                    </button>
                    <button onClick={() => goTo(2)} disabled={!hasWorkingChannel(connections)} className={primaryBtn} style={primaryStyle}>
                      {s.next}
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && agent && (
                <div>
                  {igNotice === 'connected' && (
                    <div role="status" className="rounded-xl px-3.5 py-2.5 mb-3 text-sm inline-flex items-center gap-2" style={{ background: 'var(--nav-bg)', color: 'var(--nav-success)' }}>
                      <CheckIcon /> {s.instagramConnected}
                    </div>
                  )}
                  <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold mb-1 outline-none" style={{ color: 'var(--nav-text-primary)' }}>{s.step2Title}</h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>{s.step2Text}</p>
                  <div className="nav-glass nav-card-accent rounded-2xl p-5">
                    <label className="block mb-4">
                      <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{s.nameLabel}</span>
                      <input className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)' }} maxLength={120}
                        value={name} onChange={e => setName(e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{s.descLabel}</span>
                      <textarea className={`${INPUT_CLS} min-h-[140px]`} style={{ color: 'var(--nav-text-primary)' }}
                        placeholder={s.descPlaceholder} aria-describedby="setup-desc-hint"
                        value={description} onChange={e => setDescription(e.target.value)} />
                    </label>
                    {/* Счётчик без aria-live (B7): объявлять каждое нажатие
                        клавиши незачем. Скринридеру -- только пересечение
                        порога 80 символов, через отдельную скрытую область. */}
                    <div id="setup-desc-hint" className="text-[11px] mt-1"
                      style={{ color: businessStepComplete(description, false) ? 'var(--nav-success)' : 'var(--nav-text-muted)' }}>
                      {descLen >= MIN_BUSINESS_DESCRIPTION_CHARS ? s.descEnough : s.descMore(MIN_BUSINESS_DESCRIPTION_CHARS - descLen)}
                    </div>
                    <div className="sr-only" role="status" aria-live="polite">
                      {descLen >= MIN_BUSINESS_DESCRIPTION_CHARS ? s.descEnough : s.descReachedShort(MIN_BUSINESS_DESCRIPTION_CHARS)}
                    </div>
                  </div>

                  {hasKaspiShop && effectiveShop && (
                    <div className="rounded-2xl p-4 mt-3 flex items-start gap-3" style={{ background: 'var(--nav-success-soft)' }}>
                      <span className="mt-0.5" style={{ color: 'var(--nav-success)' }}><CheckIcon /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{s.kaspiCardTitle}</div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>{s.kaspiCardText(effectiveShop.name)}</p>
                        {kaspiShops.length > 1 && (
                          <label className="block mt-2">
                            <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{s.kaspiStoreLabel}</span>
                            <select value={kaspiShopConnectionId} onChange={e => setKaspiShopConnectionId(e.target.value)}
                              className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}>
                              <option value="">{tf.kaspiShopDefaultOption}</option>
                              {kaspiShops.map(sh => <option key={sh.id} value={sh.id}>{sh.name}{sh.isActive ? tf.kaspiShopActiveSuffix : ''}</option>)}
                            </select>
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  <div role="status" aria-live="polite" className="min-h-[1.25rem] mt-3 text-xs">
                    {saveError && <span style={{ color: 'var(--nav-critical)' }}>{s.saveError}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-2">
                    <button onClick={() => goTo(1)} className={secondaryBtn} style={{ color: 'var(--nav-text-primary)' }}>{s.back}</button>
                    <button onClick={next} disabled={saving || !canGoNext(2, { description, hasKaspiShop, name })} className={primaryBtn} style={primaryStyle}>
                      {saving ? tf.savingButton : s.next}
                    </button>
                  </div>
                  {fineTune}
                </div>
              )}

              {step === 3 && agent && (
                <div>
                  <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold mb-1 outline-none" style={{ color: 'var(--nav-text-primary)' }}>{s.step3Title}</h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>{s.step3Text}</p>
                  <TestChatPanel agentId={agent.id} suggestions={s.suggestions} />
                  <div className="flex items-center justify-between gap-3 mt-4">
                    <button onClick={() => goTo(2)} className={secondaryBtn} style={{ color: 'var(--nav-text-primary)' }}>{s.back}</button>
                    <button onClick={next} className={primaryBtn} style={primaryStyle}>{s.next}</button>
                  </div>
                  {fineTune}
                </div>
              )}

              {step === 4 && agent && (
                <div>
                  <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold mb-4 outline-none" style={{ color: 'var(--nav-text-primary)' }}>{s.step4Title}</h2>

                  <div className="nav-glass nav-card-accent rounded-2xl p-5 space-y-4">
                    {/* Каналы */}
                    <div>
                      <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.06em' }}>{s.channelsLabel}</div>
                      {channelSummary.length > 0 ? (
                        <ul className="space-y-1">
                          {channelSummary.map(ch => (
                            <li key={ch.channel} className="text-sm flex items-center gap-1.5 min-w-0"
                              style={{ color: ch.state === 'ok' ? 'var(--nav-success)' : 'var(--nav-critical)' }}>
                              {ch.state === 'ok' ? <CheckIcon /> : <WarnIcon />}
                              <span className="truncate">
                                {ch.state === 'ok' ? channelLabel(ch.channel) : t.channelReconnect(channelLabel(ch.channel))}
                                {ch.state === 'ok' && ch.account && <span style={{ color: 'var(--nav-text-secondary)' }}>{' · '}{ch.account}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{s.noChannelYet}</div>
                      )}
                      {whatsappConnected && (
                        <div className="mt-3">
                          <WhatsAppUsage agentId={agent.id} />
                        </div>
                      )}
                    </div>

                    {/* Кошелёк */}
                    <div className="pt-4" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                          {s.balanceLabel}{' '}
                          <b className="tabular-nums" style={{ color: lowBalance ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}>
                            {walletBalance === null ? '···' : `${walletBalance.toLocaleString('ru-KZ')} ₸`}
                          </b>
                          {walletBalance !== null && !lowBalance && (
                            <span style={{ color: 'var(--nav-text-muted)' }}>{' · '}{s.balanceEnough(Math.floor(walletBalance / REPLY_PRICE_TENGE))}</span>
                          )}
                        </div>
                        <button onClick={openTopUp}
                          className="text-xs font-semibold nav-glass rounded-lg px-3 py-1.5" style={{ color: 'var(--nav-accent)' }}>
                          {s.topUp}
                        </button>
                      </div>
                      {lowBalance && (
                        <div role="alert" className="rounded-xl px-3.5 py-2.5 mt-2 text-sm flex items-start gap-2"
                          style={{
                            // Мягкая красная подложка + текст токеном (B5): белый на
                            // --nav-critical в тёмной теме не проходил по контрасту.
                            background: 'color-mix(in srgb, var(--nav-critical) 12%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--nav-critical) 35%, transparent)',
                            color: 'var(--nav-text-primary)',
                          }}>
                          <span className="mt-0.5" style={{ color: 'var(--nav-critical)' }}><WarnIcon /></span>
                          <span>{s.lowBalance}</span>
                        </div>
                      )}
                    </div>

                    {/* Режим */}
                    <fieldset className="pt-4" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                      <legend className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.06em' }}>{s.modeTitle}</legend>
                      <div className="space-y-2">
                        {([
                          ['active', s.modeActive, s.modeActiveHint],
                          ['training', s.modeTraining, s.modeTrainingHint],
                        ] as const).map(([value, label, hint]) => {
                          const checked = mode === value
                          return (
                            <label key={value} className="flex items-start gap-3 rounded-xl p-3 cursor-pointer transition-colors"
                              style={{ background: checked ? 'var(--nav-accent-soft)' : 'var(--nav-bg)', outline: checked ? '2px solid var(--nav-accent)' : 'none', outlineOffset: -2 }}>
                              <input type="radio" name="launch-mode" value={value} checked={checked} onChange={() => setMode(value)}
                                className="mt-0.5 accent-[var(--nav-accent)] w-4 h-4 flex-shrink-0" />
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{label}</span>
                                <span className="block text-xs mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>{hint}</span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                      {mode === 'training' && (
                        <div className="rounded-xl px-3.5 py-2.5 mt-2 text-xs flex items-start gap-2" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' }}>
                          <span className="mt-0.5" style={{ color: NAV_WARNING }}><WarnIcon /></span>
                          <span>{s.modeTrainingWarn}</span>
                        </div>
                      )}
                    </fieldset>
                  </div>

                  {!canLaunch(connections) && (
                    <div className="rounded-xl px-3.5 py-2.5 mt-3 text-sm flex items-center justify-between gap-3 flex-wrap" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-primary)' }}>
                      <span>{s.launchNeedsChannel}</span>
                      <button onClick={() => goTo(1)} className="text-xs font-semibold" style={{ color: 'var(--nav-accent)' }}>{s.toChannelStep} →</button>
                    </div>
                  )}

                  <div role="status" aria-live="polite" className="min-h-[1.25rem] mt-3 text-xs">
                    {launchError && <span style={{ color: 'var(--nav-critical)' }}>{launchError}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-2">
                    <button onClick={() => goTo(3)} className={secondaryBtn} style={{ color: 'var(--nav-text-primary)' }}>{s.back}</button>
                    <button onClick={launch} disabled={launching || !canLaunch(connections)} className={primaryBtn} style={primaryStyle}>
                      {launching ? s.launching : s.launchButton}
                    </button>
                  </div>
                  {fineTune}
                </div>
              )}
            </motion.section>
          </AnimatePresence>
          </div>
        </PageContainer>
      </main>
    </DesktopShell>
  )
}
