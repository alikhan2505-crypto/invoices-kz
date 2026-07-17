'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileAccountsDict } from '@/lib/i18n/profileAccounts'

export default function Notifications() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileAccountsDict[lang]
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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

  function Toggle({ value, onChange }: { value: boolean, onChange: (v: boolean) => void }) {
    return (
      <button onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${value ? 'bg-[#2DC48D]' : 'bg-gray-200'}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-7' : 'left-1'}`}></span>
      </button>
    )
  }

  if (loading) return <LoadingSpinner />

  const groups = [
    {
      title: t.channelsGroupTitle,
      items: [
        {
          key: 'notify_email',
          label: t.emailNotifyLabel,
          desc: t.emailNotifyDesc
        },
        {
          key: 'notify_telegram',
          label: t.telegramNotifyLabel,
          desc: t.telegramNotifyDesc
        },
      ]
    },
    {
      title: t.eventsGroupTitle,
      items: [
        {
          key: 'notify_client_viewed',
          label: t.clientViewedLabel,
          desc: t.clientViewedDesc
        },
        {
          key: 'notify_payment_reminder',
          label: t.paymentReminderLabel,
          desc: t.paymentReminderDesc
        },
        {
          key: 'notify_overdue',
          label: t.overdueLabel,
          desc: t.overdueDesc
        },
        {
          key: 'notify_weekly_report',
          label: t.weeklyReportLabel,
          desc: t.weeklyReportDesc
        },
      ]
    }
  ]

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
          <span className="font-semibold text-[#1C2056]">{t.notificationsHeaderLabel}</span>
        </div>
        {saving && <span className="text-xs text-gray-400">{t.savingLabel}</span>}
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Инфо баннер */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="text-sm font-medium text-[#1C2056] mb-1">{t.notificationsInfoTitle}</div>
          <div className="text-xs text-gray-500 leading-relaxed">
            {t.notificationsInfoBody}
          </div>
        </div>

        {groups.map(group => (
          <div key={group.title}>
            <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{group.title}</div>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {group.items.map((item, i, arr) => (
                <div key={item.key}
                  className={`flex items-center justify-between px-4 py-3.5 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <div className="flex-1 mr-4">
                    <div className="text-sm text-gray-800">{item.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
                  </div>
                  <Toggle
                    value={(settings as any)[item.key]}
                    onChange={v => toggle(item.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Telegram подключение */}
        {settings.notify_telegram && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-medium text-[#1C2056] mb-2">{t.connectTelegramTitle}</div>
            <div className="text-xs text-gray-500 mb-3">
              {t.connectTelegramBodyBefore} <span className="font-mono bg-gray-100 px-1 rounded">/start</span> {t.connectTelegramBodyAfter}
            </div>
            <a href="https://t.me/invoiceskz_support_bot"
              target="_blank"
              className="flex items-center justify-center gap-2 w-full bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
              {t.connectTelegramBotButton}
            </a>
          </div>
        )}

      </div>
    </main>
  )
}