'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Notifications() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    notify_email: true,
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
          notify_client_viewed: data.notify_client_viewed ?? true,
          notify_payment_reminder: data.notify_payment_reminder ?? true,
          notify_overdue: data.notify_overdue ?? true,
          notify_weekly_report: data.notify_weekly_report ?? false,
        })
      }
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').upsert({ id: user.id, ...settings })
    setSaving(false)
    router.push('/profile')
  }

  function Toggle({ value, onChange }: { value: boolean, onChange: (v: boolean) => void }) {
    return (
      <button onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full transition-colors relative ${value ? 'bg-[#2DC48D]' : 'bg-gray-200'}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-7' : 'left-1'}`}></span>
      </button>
    )
  }

  const groups = [
    {
      title: 'Каналы',
      items: [
        { key: 'notify_email', label: 'Уведомления на Email' },
      ]
    },
    {
      title: 'События',
      items: [
        { key: 'notify_client_viewed', label: 'Клиент просмотрел счёт' },
        { key: 'notify_payment_reminder', label: 'Напоминания об оплате' },
        { key: 'notify_overdue', label: 'Счёт просрочен' },
        { key: 'notify_weekly_report', label: 'Еженедельный отчёт' },
      ]
    }
  ]

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Уведомления</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {groups.map(group => (
          <div key={group.title}>
            <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{group.title}</div>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {group.items.map((item, i, arr) => (
                <div key={item.key}
                  className={`flex items-center justify-between px-4 py-3.5 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <span className="text-sm text-gray-800">{item.label}</span>
                  <Toggle
                    value={(settings as any)[item.key]}
                    onChange={v => setSettings({ ...settings, [item.key]: v })}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button onClick={save} disabled={saving}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
          {saving ? 'Сохраняем...' : 'Сохранить'}
        </button>
      </div>
    </main>
  )
}