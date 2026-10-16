'use client'
// /profile/notifications — Telegram как главный канал (пошаговое подключение
// с автоопределением), тумблеры по каждому событию × каналу, сгруппированные
// по продуктам, и отдельный блок «Что получают ваши клиенты».
//
// Каталог событий и значения по умолчанию — src/lib/notificationPrefs.ts
// (общий с серверными отправителями); тексты — src/lib/i18n/notifications.ts.
// Чтение/запись — только через /api/notification-prefs (один тумблер за
// запрос, атомарно на сервере), Telegram — /api/telegram-connect/*.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { useAppDialog } from '@/components/AppDialog'
import {
  LEGACY_TELEGRAM_MASTER_EVENT,
  NOTIFICATION_EVENTS,
  legacyColumnFor,
  type NotificationChannel,
  type NotificationEventDef,
  type NotificationEventKey,
  type NotificationGroup,
  type ToggleableChannel,
} from '@/lib/notificationPrefs'
import { notificationEventTexts, notificationsDict, type NotificationsPageContent } from '@/lib/i18n/notifications'
import PageHeader from '@/components/PageHeader'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx).
const EASE = [0.16, 1, 0.3, 1] as const

// Опрос статуса подключения: раз в 3 с, только пока вкладка видима, не дольше
// 10 минут подряд (возврат на вкладку или «Проверить» продлевает окно).
const POLL_INTERVAL_MS = 3000
const POLL_WINDOW_MS = 10 * 60 * 1000
// Ссылка на бота живёт 15 минут (TELEGRAM_CONNECT_TTL_MS). За 5 минут до
// конца страница сама берёт новую, чтобы на экране не висел мёртвый QR.
const LINK_REFRESH_MARGIN_MS = 5 * 60 * 1000
const LINK_FALLBACK_TTL_MS = 15 * 60 * 1000
const MASTER_KEY = `${LEGACY_TELEGRAM_MASTER_EVENT}:telegram`

// Порядок продуктов на странице. CFO — только админам (продукт adminOnly).
const OWNER_GROUP_ORDER: NotificationGroup[] = ['invoices', 'kaspiShop', 'aiAgent', 'salon', 'documents', 'acquiring', 'account', 'cfo']
const ADMIN_ONLY_GROUPS: ReadonlySet<NotificationGroup> = new Set(['cfo'])

// Клиентские сообщения, которые уходят только по явному действию продавца.
const CLIENT_MANUAL: ReadonlySet<NotificationEventKey> = new Set(['client_invoice_email', 'client_signature_request'])

type Values = Record<string, Partial<Record<NotificationChannel, boolean>>>
type TestState = { kind: 'idle' | 'sending' | 'sent' | 'rate' | 'failed' | 'error'; seconds?: number }

// ---------- иконки ----------
function SendIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 18-8-8 18-2-8-8-2Z" />
    </svg>
  )
}
function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}
function MailIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}
function ChatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
    </svg>
  )
}
function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function channelIcon(ch: NotificationChannel) {
  if (ch === 'telegram') return <SendIcon size={13} />
  if (ch === 'email') return <MailIcon />
  if (ch === 'chat') return <ChatIcon />
  return <BellIcon />
}

function channelName(t: NotificationsPageContent, ch: NotificationChannel | 'site'): string {
  if (ch === 'telegram') return t.channelTelegram
  if (ch === 'email') return t.channelEmail
  if (ch === 'chat') return t.channelChat
  if (ch === 'site') return t.channelSite
  return t.channelBell
}

// ---------- мелкие компоненты ----------
function ChannelSwitch({ checked, disabled, busy, label, name, icon, reduceMotion, onToggle }: {
  checked: boolean
  disabled: boolean
  busy: boolean
  label: string
  name: string
  icon: React.ReactNode
  reduceMotion: boolean
  onToggle: () => void
}) {
  // Неактивный тумблер показывает настоящее положение (письмо, которое ещё
  // нельзя выключить, но которое уходит, — включено), только приглушённо.
  const inactive = disabled && !busy
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      // Пока сохраняется, кнопка не disabled (иначе браузер снимает с неё
      // фокус) — повторное нажатие отсекает сама toggle().
      disabled={disabled}
      onClick={() => { if (!busy) onToggle() }}
      className="inline-flex items-center gap-2 min-h-[40px] pl-3 pr-2 rounded-full border text-xs font-medium transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nav-accent-track)]"
      style={{
        borderColor: checked && !inactive ? 'var(--nav-accent)' : 'var(--nav-border)',
        background: checked && !inactive ? 'var(--nav-accent-soft)' : 'transparent',
        color: inactive ? 'var(--nav-text-muted)' : 'var(--nav-text-primary)',
        opacity: inactive ? 0.6 : 1,
      }}
    >
      <span className="inline-flex items-center gap-1.5" style={{ color: inactive ? 'var(--nav-text-muted)' : 'var(--nav-text-secondary)' }}>
        {icon}
        <span style={{ color: inactive ? 'var(--nav-text-muted)' : 'var(--nav-text-primary)' }}>{name}</span>
      </span>
      <span
        aria-hidden="true"
        className="relative inline-block w-8 h-[18px] rounded-full flex-shrink-0"
        style={{ background: checked ? 'var(--nav-accent)' : 'var(--nav-border)', transition: reduceMotion ? 'none' : 'background-color 150ms' }}
      >
        <span
          className="absolute top-[2px] w-[14px] h-[14px] rounded-full shadow"
          style={{
            background: 'var(--nav-surface-chrome)',
            left: checked ? 16 : 2,
            transition: reduceMotion ? 'none' : 'left 150ms ease',
            opacity: busy ? 0.6 : 1,
          }}
        />
      </span>
    </button>
  )
}

function InfoPill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-full text-xs"
      style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}
    >
      {icon}
      {text}
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>
      {children}
    </h3>
  )
}

function RowError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--nav-critical)' }}>
      {message}
    </p>
  )
}

function StepBadge({ n, done, active }: { n: number; done: boolean; active: boolean }) {
  return (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{
        background: done ? 'var(--nav-success-solid, var(--nav-success))' : active ? 'var(--nav-accent)' : 'var(--nav-border-soft)',
        color: done ? 'var(--nav-success-ink, #fff)' : active ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)',
      }}
      aria-hidden="true"
    >
      {done ? <CheckIcon size={13} /> : n}
    </span>
  )
}

// ---------- страница ----------
export default function Notifications() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = notificationsDict[lang]
  const reduceMotion = !!useReducedMotion()
  const { confirm, dialogElement } = useAppDialog()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [migrated, setMigrated] = useState(true)
  const [hasEmail, setHasEmail] = useState(true)
  const [values, setValues] = useState<Values>({})
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  // Ошибка сохранения — у того тумблера, который нажали (а не баннером
  // вверху страницы, которого на телефоне не видно из нижних групп).
  const [saveFailure, setSaveFailure] = useState<{ key: string; message: string } | null>(null)
  const [telegramMaster, setTelegramMaster] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [tgConnected, setTgConnected] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [linkExpiresAt, setLinkExpiresAt] = useState(0)
  const [linkError, setLinkError] = useState(false)
  const [preparingLink, setPreparingLink] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [pollUntil, setPollUntil] = useState(0)
  const [pollPaused, setPollPaused] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [disconnecting, setDisconnecting] = useState(false)
  const [tgError, setTgError] = useState('')

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null
    return { Authorization: `Bearer ${session.access_token}` }
  }, [])

  const loadPrefs = useCallback(async (): Promise<boolean> => {
    const headers = await authHeaders()
    if (!headers) { router.push('/login'); return false }
    try {
      const res = await fetch('/api/notification-prefs', { headers, cache: 'no-store' })
      if (res.status === 401) { router.push('/login'); return false }
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      setMigrated(data.migrated !== false)
      setHasEmail(data.hasEmail !== false)
      setTgConnected(!!data.telegramConnected)
      setTelegramMaster(data.telegramMaster === true)
      setValues(data.values && typeof data.values === 'object' ? data.values : {})
      return true
    } catch {
      return false
    }
  }, [authHeaders, router])

  const prepareLink = useCallback(async (opts?: { refresh?: boolean }) => {
    setLinkError(false)
    setPreparingLink(true)
    try {
      const headers = await authHeaders()
      if (!headers) { setLinkError(true); router.push('/login'); return }
      const res = await fetch('/api/telegram-connect/init', { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.token || !data.botUsername) throw new Error('init failed')
      const url = `https://t.me/${data.botUsername}?start=${data.token}`
      setLink(url)
      setLinkExpiresAt(Number(data.expiresAt) || Date.now() + LINK_FALLBACK_TTL_MS)
      // Плановое обновление ссылки окно опроса не продлевает — иначе в
      // открытой вкладке опрос не заканчивался бы никогда.
      if (!opts?.refresh) {
        setPollPaused(false)
        setPollUntil(Date.now() + POLL_WINDOW_MS)
      }
      QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setQr).catch(() => setQr(null))
    } catch {
      // Старую ссылку не оставляем: при обновлении она могла уже истечь.
      setLink(null)
      setQr(null)
      setLinkError(true)
    } finally {
      setPreparingLink(false)
    }
  }, [authHeaders, router])

  // Первая загрузка: профиль (админ-флаг для CFO) + настройки.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [ok, adminRes] = await Promise.all([
        loadPrefs(),
        supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle(),
      ])
      if (cancelled) return
      setIsAdmin(adminRes.data?.is_admin === true)
      setLoadError(!ok)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [loadPrefs, router])

  // Ссылка на бота готовится сразу, как только ясно, что Telegram не
  // подключён: кнопка — настоящая ссылка с target=_blank (window.open после
  // await заблокировал бы браузер), а QR нужен без лишних кликов.
  // Сервер отдаёт тот же ещё свежий токен при повторном заходе (вторая
  // вкладка, перезагрузка), так что уже открытая в Telegram ссылка не ломается.
  useEffect(() => {
    if (!loading && !loadError && !tgConnected && !link && !preparingLink && !linkError) prepareLink()
  }, [loading, loadError, tgConnected, link, preparingLink, linkError, prepareLink])

  // Обновление ссылки до истечения: в видимой вкладке — сразу, в скрытой —
  // как только на неё вернутся (обычно из Telegram).
  useEffect(() => {
    if (tgConnected || !link || !linkExpiresAt) return
    let removeVisible: (() => void) | undefined
    const refresh = () => {
      if (document.visibilityState === 'visible') { prepareLink({ refresh: true }); return }
      const onVisible = () => {
        if (document.visibilityState !== 'visible') return
        document.removeEventListener('visibilitychange', onVisible)
        removeVisible = undefined
        prepareLink({ refresh: true })
      }
      document.addEventListener('visibilitychange', onVisible)
      removeVisible = () => document.removeEventListener('visibilitychange', onVisible)
    }
    const timer = setTimeout(refresh, Math.max(0, linkExpiresAt - LINK_REFRESH_MARGIN_MS - Date.now()))
    return () => {
      clearTimeout(timer)
      removeVisible?.()
    }
  }, [tgConnected, link, linkExpiresAt, prepareLink])

  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const headers = await authHeaders()
      if (!headers) return false
      const res = await fetch('/api/telegram-connect/status', { headers, cache: 'no-store' })
      if (!res.ok) return false
      const data = await res.json()
      if (!data.connected) return false
      setTgConnected(true)
      setJustConnected(true)
      setLink(null)
      setQr(null)
      // Вебхук бота включает notify_telegram — значения Telegram-тумблеров
      // по умолчанию меняются, перечитываем.
      loadPrefs()
      return true
    } catch {
      return false
    }
  }, [authHeaders, loadPrefs])

  // Опрос: только пока не подключено, ссылка выдана, окно не истекло и
  // вкладка видима. Скрытая вкладка запросов не делает; возврат на неё
  // (обычно — из Telegram) продлевает окно и проверяет сразу.
  useEffect(() => {
    if (tgConnected || !link || pollUntil === 0) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (stopped) return
      if (Date.now() > pollUntil) { setPollPaused(true); return }
      if (document.visibilityState === 'visible') {
        const connected = await checkStatus()
        if (connected || stopped) return
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS)
    }
    timer = setTimeout(tick, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setPollPaused(false)
      setPollUntil(Date.now() + POLL_WINDOW_MS)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tgConnected, link, pollUntil, checkStatus])

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  async function checkNow() {
    setPollPaused(false)
    const connected = await checkStatus()
    if (!connected) setPollUntil(Date.now() + POLL_WINDOW_MS)
  }

  function onOpenBot() {
    setPollPaused(false)
    setPollUntil(Date.now() + POLL_WINDOW_MS)
  }

  async function sendTest() {
    setTest({ kind: 'sending' })
    try {
      const headers = await authHeaders()
      if (!headers) { router.push('/login'); return }
      const res = await fetch('/api/telegram-connect/test', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setTest({ kind: 'sent' }); return }
      if (res.status === 429) { setTest({ kind: 'rate', seconds: Number(data.retryAfterSeconds) || 30 }); return }
      if (res.status === 409 && data.error === 'not_connected') {
        // Чат отвязали в другой вкладке/устройстве — показать шаги заново.
        setTgConnected(false)
        setJustConnected(false)
        setTest({ kind: 'idle' })
        loadPrefs()
        return
      }
      if (res.status === 502) { setTest({ kind: 'failed' }); return }
      setTest({ kind: 'error' })
    } catch {
      setTest({ kind: 'error' })
    }
  }

  async function disconnect() {
    if (!(await confirm(t.tgDisconnectConfirm))) return
    setTgError('')
    setDisconnecting(true)
    try {
      const headers = await authHeaders()
      if (!headers) { router.push('/login'); return }
      const res = await fetch('/api/telegram-connect/disconnect', { method: 'POST', headers })
      if (!res.ok) throw new Error('disconnect failed')
      setTgConnected(false)
      setJustConnected(false)
      setTest({ kind: 'idle' })
      setLink(null)
      setLinkError(false)
      loadPrefs()
    } catch {
      setTgError(t.tgDisconnectError)
    } finally {
      setDisconnecting(false)
    }
  }

  // Можно ли сохранить тумблер сейчас. До миграции сохраняются только письма
  // со своей старой колонкой notify_* и отписка от приветственных писем.
  function canSave(event: NotificationEventKey, channel: ToggleableChannel): boolean {
    return migrated || event === 'welcome_series' || legacyColumnFor(event, channel) !== null
  }

  async function toggle(event: NotificationEventKey, channel: ToggleableChannel, next: boolean) {
    const key = `${event}:${channel}`
    if (pending.has(key)) return
    // Сразу показываем новое положение; при ошибке — возвращаем как было.
    setValues(prev => ({ ...prev, [event]: { ...prev[event], [channel]: next } }))
    setPending(prev => new Set(prev).add(key))
    setSaveFailure(null)
    setSavedFlash(false)
    let failure: string | null = null
    let legacySave = false
    try {
      const headers = await authHeaders()
      if (!headers) { failure = t.saveError; router.push('/login'); return }
      const res = await fetch('/api/notification-prefs', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, channel, value: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        failure = res.status === 409 && data.error === 'migration_pending' ? t.saveMigrationPending : t.saveError
      } else {
        legacySave = data.legacy === true
      }
    } catch {
      failure = t.saveError
    } finally {
      if (failure) {
        setValues(prev => ({ ...prev, [event]: { ...prev[event], [channel]: !next } }))
        setSaveFailure({ key, message: failure })
      } else {
        flashSaved()
      }
      setPending(prev => { const s = new Set(prev); s.delete(key); return s })
    }
    // До миграции тумблер записал старую колонку notify_*, а от неё зависят
    // значения по умолчанию и других (заблокированных) тумблеров — например,
    // Telegram-тумблер отчёта за неделю. Перечитываем всё целиком.
    if (legacySave) loadPrefs()
  }

  function flashSaved() {
    setSavedFlash(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1800)
  }

  // До миграции: общий рубильник Telegram (старая колонка notify_telegram).
  async function toggleMaster(next: boolean) {
    if (pending.has(MASTER_KEY)) return
    setTelegramMaster(next)
    setPending(prev => new Set(prev).add(MASTER_KEY))
    setSaveFailure(null)
    setSavedFlash(false)
    let ok = false
    try {
      const headers = await authHeaders()
      if (!headers) { router.push('/login'); return }
      const res = await fetch('/api/notification-prefs', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: LEGACY_TELEGRAM_MASTER_EVENT, channel: 'telegram', value: next }),
      })
      ok = res.ok
    } catch {
      ok = false
    } finally {
      if (!ok) {
        setTelegramMaster(!next)
        setSaveFailure({ key: MASTER_KEY, message: t.saveError })
      } else {
        flashSaved()
      }
      setPending(prev => { const s = new Set(prev); s.delete(MASTER_KEY); return s })
    }
    // Значения Telegram-тумблеров по событиям следуют за рубильником.
    if (ok) loadPrefs()
  }

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  function renderChannels(def: NotificationEventDef, eventLabel: string) {
    if (def.managedAt) {
      return (
        <>
          {def.channels.map(ch => <InfoPill key={ch} icon={channelIcon(ch)} text={channelName(t, ch)} />)}
          <Link
            href={def.managedAt}
            className="inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-full text-xs font-semibold transition-colors"
            style={{ color: 'var(--nav-accent)', background: 'var(--nav-accent-soft)' }}
          >
            {t.cfoManageLink}
            <ArrowRightIcon />
          </Link>
        </>
      )
    }
    return def.channels.map(ch => {
      const toggleable = (def.toggleable as NotificationChannel[]).includes(ch)
      if (!toggleable) return <InfoPill key={ch} icon={channelIcon(ch)} text={channelName(t, ch)} />
      const tch = ch as ToggleableChannel
      const locked = (tch === 'telegram' && !tgConnected) || (tch === 'email' && !hasEmail) || !canSave(def.key, tch)
      const stored = values[def.key]?.[ch] ?? false
      // Пока Telegram не подключён, туда ничего не уходит — так и показываем.
      const shown = tch === 'telegram' && !tgConnected ? false : stored
      const name = channelName(t, ch)
      return (
        <ChannelSwitch
          key={ch}
          checked={shown}
          disabled={locked}
          busy={pending.has(`${def.key}:${tch}`)}
          label={t.channelSwitchLabel(eventLabel, name)}
          name={name}
          icon={channelIcon(ch)}
          reduceMotion={reduceMotion}
          onToggle={() => toggle(def.key, tch, !stored)}
        />
      )
    })
  }

  // Обычная функция, а не компонент: компонент, объявленный внутри страницы,
  // пересоздавался бы на каждый рендер и сбрасывал фокус с тумблера.
  function renderEventRow(def: NotificationEventDef, last: boolean, tag?: string) {
    const text = notificationEventTexts[def.key][lang]
    return (
      <div key={def.key} className="px-4 py-3.5" style={{ borderBottom: last ? 'none' : '1px solid var(--nav-border-soft)' }}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{text.label}</span>
          {tag && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>{tag}</span>
          )}
        </div>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{text.desc}</p>
        {text.requires && (
          <p className="text-[11px] mt-1 font-medium" style={{ color: 'var(--nav-text-secondary)' }}>{t.requiresPrefix}: {text.requires}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-2.5">
          {renderChannels(def, text.label)}
        </div>
        {saveFailure && saveFailure.key.startsWith(`${def.key}:`) && <RowError message={saveFailure.message} />}
      </div>
    )
  }

  if (loading) return (
      <>
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4 flex items-center justify-center" style={{ minHeight: '50vh' }}>
          <p style={{ color: 'var(--nav-text-muted)' }}>…</p>
        </div>
      </>
  )

  const ownerGroups = OWNER_GROUP_ORDER
    .filter(g => isAdmin || !ADMIN_ONLY_GROUPS.has(g))
    .map(g => ({ group: g, events: NOTIFICATION_EVENTS.filter(e => e.audience === 'owner' && e.group === g) }))
    .filter(g => g.events.length > 0 || g.group === 'account')
  const clientEvents = NOTIFICATION_EVENTS.filter(e => e.audience === 'client')
  const anyPending = pending.size > 0

  // Одна постоянная live-область Telegram-блока: меняется только её текст,
  // иначе экранные дикторы не объявляют вставленное уже с текстом сообщение.
  const tgStatus =
    !tgConnected ? null
    : test.kind === 'sent' ? { text: t.tgTestSent, tone: 'var(--nav-success)' }
    : test.kind === 'rate' ? { text: t.tgTestRateLimited(test.seconds ?? 30), tone: 'var(--nav-text-secondary)' }
    : test.kind === 'failed' ? { text: t.tgTestFailed, tone: 'var(--nav-critical)' }
    : test.kind === 'error' ? { text: t.tgTestError, tone: 'var(--nav-critical)' }
    : justConnected ? { text: t.tgJustConnected, tone: 'var(--nav-success)' }
    : null

  const testButton = (
    <button
      type="button"
      onClick={sendTest}
      disabled={!tgConnected || test.kind === 'sending'}
      className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] rounded-xl px-4 text-sm font-semibold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ borderColor: 'var(--nav-accent)', color: 'var(--nav-accent)' }}
    >
      <SendIcon size={16} />
      {test.kind === 'sending' ? t.tgTestSending : t.tgTestButton}
    </button>
  )

  return (
    <>
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4">

          {/* Шапка как на /profile/contracts: стрелка + крупный заголовок, без карточки. */}
          <PageHeader
            title={t.headerLabel}
            backHref="/profile"
            as="h1"
            right={
              <span className="text-xs" aria-live="polite" style={{ color: savedFlash ? 'var(--nav-success)' : 'var(--nav-text-muted)' }}>
                {anyPending ? t.savingLabel : savedFlash ? t.savedLabel : ''}
              </span>
            }
          />

          {loadError ? (
            <div role="alert" className="nav-glass rounded-2xl p-4 text-sm flex flex-wrap items-center justify-between gap-3">
              <span style={{ color: 'var(--nav-critical)' }}>{t.loadError}</span>
              <button
                type="button"
                onClick={async () => { setLoading(true); const ok = await loadPrefs(); setLoadError(!ok); setLoading(false) }}
                className="min-h-[40px] px-4 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                {t.retryButton}
              </button>
            </div>
          ) : (
          <div className="space-y-6">

            {/* ---------- Telegram — главный канал ---------- */}
            <motion.section {...fadeIn(1)} aria-labelledby="tg-title" className="nav-glass nav-card-accent rounded-2xl p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
                  <SendIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h2 id="tg-title" className="text-base font-bold" style={{ color: 'var(--nav-text-primary)' }}>{t.tgTitle}</h2>
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={tgConnected
                        ? { background: 'var(--nav-success-soft, var(--nav-border-soft))', color: 'var(--nav-success)' }
                        : { background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}
                    >
                      {tgConnected && <CheckIcon size={11} />}
                      {tgConnected ? t.tgStatusConnected : t.tgStatusNotConnected}
                    </span>
                  </div>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>
                    {tgConnected ? t.tgConnectedBody : t.tgSubtitle}
                  </p>
                </div>
              </div>

              {tgConnected ? (
                <div className="mt-4 space-y-3">
                  {!migrated && (
                    <div>
                      <ChannelSwitch
                        checked={telegramMaster}
                        disabled={false}
                        busy={pending.has(MASTER_KEY)}
                        label={t.tgMasterLabel}
                        name={t.tgMasterLabel}
                        icon={<SendIcon size={13} />}
                        reduceMotion={reduceMotion}
                        onToggle={() => toggleMaster(!telegramMaster)}
                      />
                      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{t.tgMasterDesc}</p>
                      {saveFailure?.key === MASTER_KEY && <RowError message={saveFailure.message} />}
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    {testButton}
                    <button
                      type="button"
                      onClick={disconnect}
                      disabled={disconnecting}
                      className="inline-flex items-center justify-center w-full sm:w-auto min-h-[44px] rounded-xl px-4 text-sm font-medium transition-colors disabled:opacity-60 hover:bg-[var(--nav-surface-glass)]"
                      style={{ color: 'var(--nav-critical)' }}
                    >
                      {disconnecting ? t.tgDisconnecting : t.tgDisconnectButton}
                    </button>
                  </div>
                  {tgError && <p role="alert" className="text-xs" style={{ color: 'var(--nav-critical)' }}>{tgError}</p>}
                </div>
              ) : (
                <ol className="mt-4 space-y-4">
                  {/* 1. Открыть бота */}
                  <li className="flex gap-3">
                    <StepBadge n={1} done={false} active />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.tgStep1Title}</div>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{t.tgStep1Body}</p>
                      <div className="mt-2.5 flex flex-col sm:flex-row sm:items-start gap-3">
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={onOpenBot}
                            className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl px-4 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transform-none"
                            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
                          >
                            <SendIcon size={16} />
                            {t.tgOpenBotButton}
                          </a>
                        ) : linkError ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span role="alert" className="text-xs" style={{ color: 'var(--nav-critical)' }}>{t.tgLinkError}</span>
                            <button type="button" onClick={() => prepareLink()} className="min-h-[40px] px-3 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--nav-border)', color: 'var(--nav-text-primary)' }}>
                              {t.retryButton}
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center min-h-[44px] text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.tgPreparingLink}</span>
                        )}
                        {link && qr && (
                          <figure className="hidden sm:flex items-center gap-3">
                            {/* QR всегда на белом — иначе камера не прочитает его в тёмной теме. */}
                            <img src={qr} alt={t.tgQrAlt} width={112} height={112} className="rounded-lg p-1.5 border" style={{ background: '#fff', borderColor: 'var(--nav-border-soft)' }} />
                            <figcaption className="text-xs max-w-[180px] leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{t.tgQrCaption}</figcaption>
                          </figure>
                        )}
                      </div>
                    </div>
                  </li>
                  {/* 2. Start */}
                  <li className="flex gap-3">
                    <StepBadge n={2} done={false} active={!!link} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.tgStep2Title}</div>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{t.tgStep2Body}</p>
                    </div>
                  </li>
                  {/* 3. Автоопределение */}
                  <li className="flex gap-3">
                    <StepBadge n={3} done={false} active={!!link} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.tgStep3Title}</div>
                      {link && (
                        <div className="mt-1 flex flex-wrap items-center gap-2" aria-live="polite">
                          {pollPaused ? (
                            <>
                              <span className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.tgStep3Paused}</span>
                              <button type="button" onClick={checkNow} className="min-h-[36px] px-3 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--nav-border)', color: 'var(--nav-text-primary)' }}>
                                {t.tgCheckAgainButton}
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                              <span className="w-2 h-2 rounded-full motion-safe:animate-pulse" style={{ background: 'var(--nav-accent)' }} aria-hidden="true" />
                              {t.tgStep3Waiting}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                  {/* 4. Тест */}
                  <li className="flex gap-3">
                    <StepBadge n={4} done={false} active={false} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-muted)' }}>{t.tgStep4Title}</div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.tgStep4Locked}</p>
                    </div>
                  </li>
                </ol>
              )}
              {/* Всегда в DOM (вне веток «подключено»/«шаги»), меняется только текст. */}
              <p
                role="status"
                aria-live="polite"
                className={tgStatus ? 'mt-3 text-sm font-medium flex items-center gap-2 leading-relaxed' : 'sr-only'}
                style={tgStatus ? { color: tgStatus.tone } : undefined}
              >
                {tgStatus && test.kind === 'idle' && <CheckIcon />}
                {tgStatus?.text ?? ''}
              </p>
            </motion.section>

            {!migrated && (
              <div className="rounded-2xl p-3.5 flex items-start gap-2 text-xs leading-relaxed" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>
                <span className="mt-0.5" style={{ color: 'var(--nav-text-muted)' }}><InfoIcon /></span>
                {t.migrationPendingHint}
              </div>
            )}

            {/* ---------- Что присылать вам ---------- */}
            <motion.section {...fadeIn(2)} aria-labelledby="owner-title">
              <h2 id="owner-title" className="text-base font-bold px-1" style={{ color: 'var(--nav-text-primary)' }}>{t.ownerSectionTitle}</h2>
              <p className="text-xs px-1 mt-1 mb-4 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>
                {t.ownerSectionBody}{!tgConnected ? ` ${t.tgLockedHint}` : ''}
              </p>
              <div className="space-y-5">
                {ownerGroups.map(({ group, events }) => (
                  <div key={group}>
                    <SectionTitle>{t.groupTitles[group]}</SectionTitle>
                    <div className="nav-glass rounded-2xl overflow-hidden">
                      {events.map((def, i) => renderEventRow(def, i === events.length - 1 && group !== 'account'))}
                      {group === 'account' && (
                        <div className="px-4 py-3.5">
                          <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.bonusInfoLabel}</div>
                          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{t.bonusInfoDesc}</p>
                          <div className="flex flex-wrap gap-2 mt-2.5">
                            <InfoPill icon={<BellIcon />} text={channelName(t, 'site')} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>

            {/* ---------- Что получают ваши клиенты ---------- */}
            <motion.section {...fadeIn(3)} aria-labelledby="client-title">
              <h2 id="client-title" className="text-base font-bold px-1" style={{ color: 'var(--nav-text-primary)' }}>{t.clientSectionTitle}</h2>
              <p className="text-xs px-1 mt-1 mb-4 leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{t.clientSectionBody}</p>
              <div className="nav-glass rounded-2xl overflow-hidden">
                {clientEvents.map(def => renderEventRow(def, false, CLIENT_MANUAL.has(def.key) ? t.clientManualTag : t.clientAutoTag))}
                <div className="px-4 py-3.5 flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>
                  <span className="mt-0.5" style={{ color: 'var(--nav-text-muted)' }}><InfoIcon /></span>
                  {t.clientNoAutoReminders}
                </div>
              </div>
            </motion.section>

          </div>
          )}
        </div>
      {dialogElement}
    </>
  )
}
