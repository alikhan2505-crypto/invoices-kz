'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { contractsDict } from '@/lib/i18n/contracts'

type Contract = {
  id: string
  title: string
  client_name: string | null
  client_email: string | null
  file_url: string
  created_at: string
}

export default function Contracts() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = contractsDict[lang]

  const [contracts, setContracts] = useState<Contract[]>([])
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', client_name: '', client_email: '' })
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: c } = await supabase.from('contracts').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setContracts(c || [])

    if (c && c.length > 0) {
      const { data: sigs } = await supabase
        .from('document_signatures')
        .select('document_id, status')
        .eq('document_type', 'contract')
        .in('document_id', c.map(x => x.id))
      const map: Record<string, string> = {}
      for (const s of sigs || []) map[s.document_id] = s.status
      setStatuses(map)
    }
    setLoading(false)
  }

  function resetForm() {
    setForm({ title: '', client_name: '', client_email: '' })
    setFile(null)
    setShowForm(false)
  }

  async function saveContract() {
    if (!form.title) { alert(t.titleRequiredAlert); return }
    if (!file) { alert(t.fileRequiredAlert); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const path = `contracts/${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadError } = await supabase.storage.from('signed-documents').upload(path, file, { contentType: 'application/pdf' })
    if (uploadError) { alert(t.errorPrefix(uploadError.message)); setSaving(false); return }
    const fileUrl = supabase.storage.from('signed-documents').getPublicUrl(path).data.publicUrl

    const { error } = await supabase.from('contracts').insert({
      user_id: user.id,
      title: form.title,
      client_name: form.client_name || null,
      client_email: form.client_email || null,
      file_url: fileUrl,
    })
    if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }

    resetForm()
    await load()
    setSaving(false)
  }

  async function deleteContract(id: string) {
    if (!confirm(t.deleteContractConfirm)) return
    await supabase.from('contracts').delete().eq('id', id)
    setContracts(prev => prev.filter(c => c.id !== id))
  }

  function statusBadge(id: string) {
    const status = statuses[id]
    if (status === 'signed') return { text: t.statusSigned, className: 'bg-green-100 text-green-700' }
    if (status === 'awaiting_client') return { text: t.statusAwaitingClient, className: 'bg-blue-100 text-blue-700' }
    return { text: t.statusNotSent, className: 'bg-gray-100 text-gray-500' }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
          <span className="font-semibold text-[#1C2056]">{t.headerLabel}</span>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">
            {t.uploadButton}
          </button>
        )}
      </div>

      <div className="max-w-lg mx-auto p-4">

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 space-y-3">
            <div className="font-medium text-[#1C2056] mb-2">{t.newContractTitle}</div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.titleFieldLabel}</label>
              <input
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.titleFieldPlaceholder}
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.clientNameFieldLabel}</label>
              <input
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.clientNameFieldPlaceholder}
                value={form.client_name}
                onChange={e => setForm({ ...form, client_name: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.clientEmailFieldLabel}</label>
              <input
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder={t.clientEmailFieldPlaceholder}
                type="email"
                value={form.client_email}
                onChange={e => setForm({ ...form, client_email: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.fileFieldLabel}</label>
              <label className="block border-2 border-dashed border-gray-200 rounded-xl py-4 text-center cursor-pointer">
                <span className="text-sm text-[#1C2056]">
                  {file ? t.fileChosenLabel(file.name) : t.chooseFileButton}
                </span>
                <input type="file" accept="application/pdf" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={resetForm}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500">
                {t.cancelButton}
              </button>
              <button onClick={saveContract} disabled={saving}
                className="flex-1 bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
                {saving ? t.savingLabel : t.saveButton}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-8">{t.loadingLabel}</p>
        ) : contracts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📃</div>
            <p className="text-gray-400 text-sm">{t.noContractsHint}</p>
            <p className="text-xs text-gray-400 mt-1 px-6">{t.noContractsSubHint}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {contracts.map((c, i) => {
              const badge = statusBadge(c.id)
              return (
                <div key={c.id} onClick={() => router.push(`/contract/${c.id}`)}
                  className={`flex items-start justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i < contracts.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1C2056] truncate">{c.title}</div>
                    {c.client_name && <div className="text-xs text-gray-500 mt-0.5">{c.client_name}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">{formatDate(c.created_at)}</div>
                    <span className={`inline-block text-xs px-1.5 py-0.5 rounded mt-1.5 ${badge.className}`}>{badge.text}</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteContract(c.id) }}
                    aria-label={t.deleteButton}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0 ml-2">
                    <span className="text-base leading-none">✕</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
