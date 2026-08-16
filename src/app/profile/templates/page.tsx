'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileContentDict } from '@/lib/i18n/profileContent'

export default function Templates() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const [{ data: p }, { data: tData }] = await Promise.all([
      supabase.from('profiles').select('plan').eq('id', user.id).single(),
      supabase.from('templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    setProfile(p)
    setTemplates(tData || [])
    setLoading(false)
  }

  async function deleteTemplate(id: string) {
    if (!confirm(t.deleteTemplateConfirm)) return
    await supabase.from('templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(tpl => tpl.id !== id))
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.templatesLoadingLabel}</p>
    </main>
  )

  const isPro = profile?.plan === 'pro'

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.templatesHeaderLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        {!isPro ? (
          <div className="bg-[#1C2056] rounded-2xl p-6 text-center">
            <div className="text-4xl mb-3">⭐</div>
            <div className="font-bold text-white text-lg mb-2">{t.proOnlyTitle}</div>
            <div className="text-white/60 text-sm mb-5">
              {t.proOnlyDesc}
            </div>
            <button onClick={() => router.push('/upgrade')}
              className="bg-[#2DC48D] text-white px-6 py-3 rounded-xl text-sm font-medium">
              {t.upgradeToProButton}
            </button>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400 text-sm mb-4">{t.noTemplatesLabel}</p>
            <p className="text-xs text-gray-400">
              {t.noTemplatesHint}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(tpl => (
              <div key={tpl.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => router.push('/dashboard?template=' + tpl.id)}>
                    <div className="font-medium text-[#1C2056] mb-1">{tpl.name}</div>
                    {tpl.client_name && (
                      <div className="text-xs text-gray-400 mb-1">{t.templateClientLabel(tpl.client_name)}</div>
                    )}
                    {tpl.services && tpl.services.length > 0 && (
                      <div className="text-xs text-gray-400">
                        {tpl.services.map((s: any) => s.name).join(', ')}
                      </div>
                    )}
                    <div className="text-sm font-medium text-[#2DC48D] mt-2">
                      {Number(tpl.amount).toLocaleString('ru-KZ')} ₸
                    </div>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <button
                      onClick={() => router.push('/dashboard?template=' + tpl.id)}
                      className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">
                      {t.useTemplateButton}
                    </button>
                    <button
                      onClick={() => deleteTemplate(tpl.id)}
                      className="text-gray-400 hover:text-red-400 text-lg">
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