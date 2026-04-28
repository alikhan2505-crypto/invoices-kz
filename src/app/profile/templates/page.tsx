'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Templates() {
  const router = useRouter()
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from('profiles').select('plan').eq('id', user.id).single(),
      supabase.from('templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    setProfile(p)
    setTemplates(t || [])
    setLoading(false)
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Удалить шаблон?')) return
    await supabase.from('templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Загрузка...</p>
    </main>
  )

  const isPro = profile?.plan === 'pro'

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Шаблоны счетов</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        {!isPro ? (
          <div className="bg-[#1C2056] rounded-2xl p-6 text-center">
            <div className="text-4xl mb-3">⭐</div>
            <div className="font-bold text-white text-lg mb-2">Только для Про</div>
            <div className="text-white/60 text-sm mb-5">
              Сохраняйте шаблоны и создавайте счета в один клик
            </div>
            <button onClick={() => router.push('/upgrade')}
              className="bg-[#2DC48D] text-white px-6 py-3 rounded-xl text-sm font-medium">
              Перейти на Про — 5 990 ₸/мес
            </button>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400 text-sm mb-4">Нет шаблонов</p>
            <p className="text-xs text-gray-400">
              Создайте счёт и нажмите "Сохранить как шаблон"
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => router.push('/dashboard?template=' + t.id)}>
                    <div className="font-medium text-[#1C2056] mb-1">{t.name}</div>
                    {t.client_name && (
                      <div className="text-xs text-gray-400 mb-1">Клиент: {t.client_name}</div>
                    )}
                    {t.services && t.services.length > 0 && (
                      <div className="text-xs text-gray-400">
                        {t.services.map((s: any) => s.name).join(', ')}
                      </div>
                    )}
                    <div className="text-sm font-medium text-[#2DC48D] mt-2">
                      {Number(t.amount).toLocaleString('ru-KZ')} ₸
                    </div>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <button
                      onClick={() => router.push('/dashboard?template=' + t.id)}
                      className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">
                      Использовать
                    </button>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      className="text-gray-300 hover:text-red-400 text-lg">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}