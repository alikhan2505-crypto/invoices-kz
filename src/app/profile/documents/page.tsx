'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import { formatDate } from '@/lib/date'

export default function Documents() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'kp' | 'avr' | 'nakladnaya'>('kp')
  const [kpList, setKpList] = useState<any[]>([])
  const [avrList, setAvrList] = useState<any[]>([])
  const [naklList, setNaklList] = useState<any[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

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

  async function deleteDoc(table: string, id: string) {
    if (!confirm('Удалить документ?')) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  if (loading) return <LoadingSpinner />

  const tabs = [
    { key: 'kp', label: '📋 КП', count: kpList.length, table: 'kp_documents' },
    { key: 'avr', label: '📄 АВР', count: avrList.length, table: 'avr_documents' },
    { key: 'nakladnaya', label: '📦 Накладные', count: naklList.length, table: 'nakladnaya_documents' },
  ]

  const currentTab = tabs.find(t => t.key === tab)!
  const currentList = tab === 'kp' ? kpList : tab === 'avr' ? avrList : naklList

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Документы для налоговой</span>
      </div>

      <div className="max-w-lg mx-auto p-4">

        {/* Инфо */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">
          <div className="text-sm font-medium text-[#1C2056] mb-1">📊 Для отчётности 910 формы</div>
          <div className="text-xs text-gray-500 leading-relaxed">
            Здесь хранятся все КП, АВР и Накладные которые вы создавали. Используйте для налоговой отчётности.
          </div>
        </div>

        {/* Табы */}
        <div className="flex gap-2 mb-4">
          {tabs.map(t => (
            <button key={t.key}
              onClick={() => setTab(t.key as any)}
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

        {/* Список */}
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
                className={`flex items-center px-4 py-3.5 ${i < currentList.length - 1 ? 'border-b border-gray-100' : ''}`}>
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
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-[#1C2056]">
                    {Number(doc.total).toLocaleString('ru-KZ')} ₸
                  </span>
                  <button
                    onClick={() => deleteDoc(currentTab.table, doc.id)}
                    className="text-gray-300 hover:text-red-400 text-lg">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Статистика */}
        {currentList.length > 0 && (
          <div className="bg-[#1C2056] rounded-xl px-4 py-3 mt-4 flex items-center justify-between">
            <span className="text-white/70 text-sm">Итого документов: {currentList.length}</span>
            <span className="text-white font-bold">
              {currentList.reduce((sum, d) => sum + Number(d.total), 0).toLocaleString('ru-KZ')} ₸
            </span>
          </div>
        )}

      </div>
    </main>
  )
}