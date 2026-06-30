'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import { formatDate } from '@/lib/date'
import { getActivePlan } from '@/lib/plan'
import { generateNakladnaya } from '@/lib/generateNakladnaya'

export default function Documents() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'kp' | 'avr' | 'nakladnaya'>('kp')
  const [kpList, setKpList] = useState<any[]>([])
  const [avrList, setAvrList] = useState<any[]>([])
  const [naklList, setNaklList] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [busyDocId, setBusyDocId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    const ap = getActivePlan(p)
    if (!ap.canKpAvrNakl) {
      setLoading(false)
      return
    }

    const [{ data: kp }, { data: avr }, { data: nakl }] = await Promise.all([
      supabase.from('kp_documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('avr_documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('nakladnaya_documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])

    setKpList(kp || [])
    setAvrList(avr || [])
    setNaklList(nakl || [])
    setLoading(false)
  }

  async function deleteDoc(id: string, table: string) {
    if (!confirm('Удалить документ?')) return
    setBusyDocId(id)
    await supabase.from(table).delete().eq('id', id)
    await load()
    setBusyDocId(null)
  }

  async function openNakl(doc: any) {
    const win = window.open('', '_blank')
    setBusyDocId(doc.id)
    await generateNakladnaya({
      number: doc.number,
      date: doc.date,
      clientName: doc.client_name,
      clientBin: doc.client_bin,
      services: doc.services,
      total: doc.total,
      vatType: doc.vat_type,
      profile: profile,
    }, win)
    setBusyDocId(null)
  }

  if (loading) return <LoadingSpinner />

  const ap = getActivePlan(profile)

  if (!ap.canKpAvrNakl) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl">‹</button>
          <span className="font-semibold text-[#1C2056]">Документы для налоговой</span>
        </div>
        <div className="max-w-lg mx-auto p-4">
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-semibold text-[#1C2056] mb-2">Доступно на тарифе Про</div>
            <div className="text-sm text-gray-400 mb-6">
              КП, АВР и Накладные для налоговой отчётности доступны только на тарифе Про
            </div>
            <button onClick={() => router.push('/upgrade')}
              className="bg-[#1C2056] text-white rounded-xl px-6 py-3 text-sm font-medium">
              🚀 Перейти к тарифам
            </button>
          </div>
        </div>
      </main>
    )
  }

  const tabs = [
    { key: 'kp', label: '📋 КП', count: kpList.length },
    { key: 'avr', label: '📄 АВР', count: avrList.length },
    { key: 'nakladnaya', label: '📦 Накладные', count: naklList.length },
  ]

  const currentList = tab === 'kp' ? kpList : tab === 'avr' ? avrList : naklList

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Документы для налоговой</span>
      </div>

      <div className="max-w-lg mx-auto p-4">

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">
          <div className="text-sm font-medium text-[#1C2056] mb-1">📊 Для отчётности 910 формы</div>
          <div className="text-xs text-gray-500 leading-relaxed">
            История всех КП, АВР и Накладных.
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition ${tab === t.key ? 'bg-[#1C2056] text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1 text-xs ${tab === t.key ? 'text-white/70' : 'text-gray-400'}`}>
                  ({t.count})
                </span>
              )}
            </button>
          ))}
        </div>

        {currentList.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400 text-sm">Нет документов</p>
            <p className="text-xs text-gray-400 mt-1">
              Создавайте {tab === 'kp' ? 'КП' : tab === 'avr' ? 'АВР' : 'Накладные'} на странице счёта
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {currentList.map((doc, i) => (
              <div key={doc.id}
                className={`px-4 py-3.5 ${i < currentList.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1C2056]">№{doc.number}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {formatDate(doc.created_at)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{doc.client_name}</div>
                    {doc.contract_number && (
                      <div className="text-xs text-gray-400 mt-0.5">Договор №{doc.contract_number}</div>
                    )}
                    {doc.valid_until && (
                      <div className="text-xs text-gray-400 mt-0.5">Действителен до: {doc.valid_until}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    <span className="text-sm font-bold text-[#1C2056] mr-1">
                      {Number(doc.total).toLocaleString('ru-KZ')} ₸
                    </span>
                    {tab === 'nakladnaya' && (
                      <button
                        onClick={() => openNakl(doc)}
                        disabled={busyDocId === doc.id}
                        aria-label="Открыть накладную"
                        title="Открыть"
                        className="w-8 h-8 flex items-center justify-center rounded-full text-blue-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors">
                        <span className="text-base leading-none">👁</span>
                      </button>
                    )}
                    <button
                      onClick={() => deleteDoc(doc.id, tab === 'kp' ? 'kp_documents' : tab === 'avr' ? 'avr_documents' : 'nakladnaya_documents')}
                      disabled={busyDocId === doc.id}
                      aria-label="Удалить документ"
                      title="Удалить"
                      className="w-8 h-8 flex items-center justify-center rounded-full text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
                      <span className="text-base leading-none">✕</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {currentList.length > 0 && (
          <div className="bg-[#1C2056] rounded-xl px-4 py-3 mt-4 flex items-center justify-between">
            <span className="text-white/70 text-sm">Итого: {currentList.length} документов</span>
            <span className="text-white font-bold">
              {currentList.reduce((sum, d) => sum + Number(d.total), 0).toLocaleString('ru-KZ')} ₸
            </span>
          </div>
        )}

      </div>
    </main>
  )
}