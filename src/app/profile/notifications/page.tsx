'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileAccountsDict } from '@/lib/i18n/profileAccounts'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
    </svg>
  )
}
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 18-8-8 18-2-8-8-2Z" />
    </svg>
  )
}

export default function Notifications() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileAccountsDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null)
  const [telegramConnecting, setTelegramConnecting] = useState(false)
  const [telegramDisconnecting, setTelegramDisconnecting] = useState(false)
  const [telegramError, setTelegramError] = useState('')
  const [settings, setSettings] = useState({
    notify_email: true,
    notify_telegram: false,
    notify_client_viewed: true,
    notify_payment_reminder: true,
    notify_overdue: true,
    notify_weekly_report: false,
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        setSettings({
          notify_email: data.notify_email ?? true,
          notify_telegram: data.notify_telegram ?? false,
          notify_client_viewed: data.notify_client_viewed ?? true,
          notify_payment_reminder: data.notify_payment_reminder ?? true,
          notify_overdue: data.notify_overdue ?? true,
          notify_weekly_report: data.notify_weekly_report ?? false,
        })
        setTelegramChatId(data.telegram_chat_id ?? null)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function toggle(key: string, value: boolean) {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').upsert({ id: user.id, ...newSettings })
    setSaving(false)
  }

  async function connectTelegram() {
    setTelegramError('')
    setTelegramConnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/telegram-connect/init', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.token) {
        setTelegramError(t.telegramConnectErrorGeneric)
        return
      }
      window.location.href = `https://t.me/${data.botUsername}?start=${data.token}`
    } finally {
      setTelegramConnecting(false)
    }
  }

  async function disconnectTelegram() {
    setTelegramDisconnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/telegram-connect/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      setTelegramChatId(null)
    } finally {
      setTelegramDisconnecting(false)
    }
  }

  function Toggle({ value, onChange }: { value: boolean, onChange: (v: boolean) => void }) {
    return (
      <button onClick={() => onChange(!value)}
        className="w-12 h-6 rounded-full transition-colors relative flex-shrink-0"
        style={{ background: value ? 'var(--nav-accent)' : 'var(--nav-border)' }}>
        <span className="absolute top-1 w-4 h-4 rounded-full shadow transition-all"
          style={{ background: 'var(--nav-surface-chrome)', left: value ? '1.75rem' : '0.25rem' }}></span>
      </button>
    )
  }

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  const groups = [
    {
      title: t.channelsGroupTitle,
      items: [
        { key: 'notify_email', label: t.emailNotifyLabel, desc: t.emailNotifyDesc },
        { key: 'notify_telegram', label: t.telegramNotifyLabel, desc: t.telegramNotifyDesc },
      ]
    },
    {
      title: t.eventsGroupTitle,
      items: [
        { key: 'notify_client_viewed', label: t.clientViewedLabel, desc: t.clientViewedDesc },
        { key: 'notify_payment_reminder', label: t.paymentReminderLabel, desc: t.paymentReminderDesc },
        { key: 'notify_overdue', label: t.overdueLabel, desc: t.overdueDesc },
        { key: 'notify_weekly_report', label: t.weeklyReportLabel, desc: t.weeklyReportDesc },
      ]
    }
  ]

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-2xl mx-auto p-4 flex items-center justify-center" style={{ minHeight: '50vh' }}>
        <p style={{ color: 'var(--nav-text-muted)' }}>…</p>
      </div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-lg lg:max-w-2xl mx-auto p-4 space-y-4">

        <motion.div {...fadeIn(0)} className="nav-glass rounded-2xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/profile')} className="back-btn transition-colors flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }} aria-label={backLabel(lang)}>
              <ChevronLeftIcon />
            </button>
            <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.notificationsHeaderLabel}</span>
          </div>
          {saving && <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.savingLabel}</span>}
        </motion.div>

        {/* Инфо баннер */}
        <motion.div {...fadeIn(1)} className="nav-glass rounded-2xl p-4 flex items-start gap-2" style={{ background: 'var(--nav-accent-soft)' }}>
          <span className="mt-0.5" style={{ color: 'var(--nav-accent)' }}><InfoIcon /></span>
          <div>
            <div className="text-sm font-medium mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.notificationsInfoTitle}</div>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>
              {t.notificationsInfoBody}
            </div>
          </div>
        </motion.div>

        {groups.map((group, gi) => (
          <motion.div key={group.title} {...fadeIn(2 + gi)}>
            <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{group.title}</div>
            <div className="nav-glass rounded-2xl overflow-hidden">
              {group.items.map((item, i, arr) => (
                <div key={item.key}
                  className="flex items-center justify-between px-4 py-3.5"
                  style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}>
                  <div className="flex-1 mr-4">
                    <div className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{item.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{item.desc}</div>
                  </div>
                  <Toggle
                    value={(settings as any)[item.key]}
                    onChange={v => toggle(item.key, v)}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Telegram подключение */}
        {settings.notify_telegram && (
          <motion.div {...fadeIn(2 + groups.length)} className="nav-glass rounded-2xl p-4">
            {telegramChatId ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: 'var(--nav-teal)' }}><SendIcon /></span>
                  <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.telegramConnectedLabel}</div>
                </div>
                <div className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.telegramConnectedHint}</div>
                <button onClick={disconnectTelegram} disabled={telegramDisconnecting}
                  className="w-full rounded-xl py-3 text-sm font-medium border transition-colors disabled:opacity-60"
                  style={{ borderColor: 'var(--nav-critical)', color: 'var(--nav-critical)' }}>
                  {telegramDisconnecting ? t.disconnectingLabel : t.disconnectTelegramButton}
                </button>
              </>
            ) : (
              <>
                <div className="text-sm font-medium mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.connectTelegramTitle}</div>
                <div className="text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                  {t.connectTelegramBodyBefore} <span className="font-mono px-1 rounded" style={{ background: 'var(--nav-border-soft)' }}>/start</span> {t.connectTelegramBodyAfter}
                </div>
                {telegramError && <p className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{telegramError}</p>}
                <button onClick={connectTelegram} disabled={telegramConnecting}
                  className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-medium transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  <SendIcon />
                  {telegramConnecting ? t.disconnectingLabel : t.connectTelegramBotButton}
                </button>
              </>
            )}
          </motion.div>
        )}

      </div>
    </main>
    </DesktopShell>
  )
}
