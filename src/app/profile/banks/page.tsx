'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileAccountsDict } from '@/lib/i18n/profileAccounts'

export default function Banks() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileAccountsDict[lang]
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ bank_name: '', iik: '', bik: '', kbe: '19', currency: 'KZT' })

  useEffect(() => { loadAccounts() }, [])

  async function loadAccounts() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('bank_accounts').select('*').eq('user_id', user.id).order('created_at')
    setAccounts(data || [])
    setLoading(false)
  }

  function startEdit(acc: any) {
    setEditingId(acc.id)
    setForm({ bank_name: acc.bank_name, iik: acc.iik, bik: acc.bik || '', kbe: acc.kbe || '19', currency: acc.currency || 'KZT' })
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm({ bank_name: '', iik: '', bik: '', kbe: '19', currency: 'KZT' })
    setShowForm(false)
  }

  async function saveAccount() {
    if (!form.bank_name || !form.iik) { alert(t.fillBankNameAndIikAlert); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (editingId) {
      const { error } = await supabase.from('bank_accounts').update({ ...form }).eq('id', editingId)
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
    } else {
      const is_main = accounts.length === 0
      const { error } = await supabase.from('bank_accounts').insert({ ...form, user_id: user.id, is_main })
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
    }
    resetForm()
    loadAccounts()
    setSaving(false)
  }

  async function setMain(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('bank_accounts').update({ is_main: false }).eq('user_id', user.id)
    await supabase.from('bank_accounts').update({ is_main: true }).eq('id', id)
    loadAccounts()
  }

  async function deleteAccount(id: string) {
    if (!confirm(t.deleteAccountConfirm)) return
    await supabase.from('bank_accounts').delete().eq('id', id)
    loadAccounts()
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.banksHeaderLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4">
        {loading ? (
          <p className="text-center text-gray-400 py-8">{t.loadingLabel}</p>
        ) : accounts.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🏦</div>
            <p className="text-gray-400 text-sm">{t.noAccountsLabel}</p>
          </div>
        ) : (
          <div className="space-y-3 mb-4">
            {accounts.map(acc => (
              <div key={acc.id} className={`bg-white rounded-2xl p-4 shadow-sm border-2 ${acc.is_main ? 'border-[#2DC48D]' : 'border-transparent'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#1C2056]">{acc.bank_name}</span>
                      {acc.is_main && <span className="text-xs bg-[#2DC48D]/10 text-[#2DC48D] px-2 py-0.5 rounded-full">{t.mainBadgeLabel}</span>}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">{acc.iik}</div>
                    {acc.bik && <div className="text-xs text-gray-400 mt-0.5">{t.bikPrefixLabel(acc.bik)}</div>}
                    <div className="text-xs text-gray-400 mt-1">{t.currencyActiveLabel(acc.currency)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Звёздочка — сделать основным */}
                    {!acc.is_main && (
                      <button onClick={() => setMain(acc.id)}
                        className="text-gray-400 hover:text-yellow-400 text-xl" title={t.setMainTitle}>
                        ☆
                      </button>
                    )}
                    {acc.is_main && (
                      <span className="text-yellow-400 text-xl">★</span>
                    )}
                    {/* Карандаш — редактировать */}
                    <button onClick={() => startEdit(acc)}
                      className="text-gray-400 hover:text-[#1C2056] text-lg" title={t.editTitle}>
                      ✏️
                    </button>
                    {/* Крестик — удалить */}
                    <button onClick={() => deleteAccount(acc.id)}
                      className="text-gray-400 hover:text-red-400 text-lg" title={t.deleteTitle}>
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
            <div className="font-medium text-[#1C2056] mb-2">
              {editingId ? t.editAccountHeading : t.newAccountHeading}
            </div>
            {[
              { key: 'bank_name', label: t.bankNameFieldLabel, placeholder: t.bankNamePlaceholder },
              { key: 'iik', label: t.iikFieldLabel, placeholder: t.iikPlaceholder },
              { key: 'bik', label: t.bikFieldLabel, placeholder: t.bikPlaceholder },
              { key: 'kbe', label: t.kbeFieldLabel, placeholder: t.kbePlaceholder },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                <input
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.currencyFieldLabel}</label>
              <select
                className="w-full border-b border-gray-200 py-2 text-sm outline-none"
                value={form.currency}
                onChange={e => setForm({ ...form, currency: e.target.value })}>
                <option>KZT</option>
                <option>USD</option>
                <option>EUR</option>
                <option>RUB</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={resetForm}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500">
                {t.cancelButton}
              </button>
              <button onClick={saveAccount} disabled={saving}
                className="flex-1 bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
                {saving ? t.savingEllipsis : editingId ? t.saveButton : t.addLabel}
              </button>
            </div>
          </div>
        )}

        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
            {t.addAccountButton}
          </button>
        )}
      </div>
    </main>
  )
}