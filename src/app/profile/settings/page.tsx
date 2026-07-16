'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { profileCoreDict } from '@/lib/i18n/profileCore'

export default function InvoiceSettings() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileCoreDict[lang]
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useState({
    invoice_prefix: 'INV-',
    invoice_next_number: '0001',
    default_currency: 'KZT',
    default_due_days: '3',
    default_note: '',
    vat_type: 'no_vat',
    kp_prefix: 'КП-',
    kp_next_number: '1',
    avr_prefix: 'АВР-',
    avr_next_number: '1',
    nakladnaya_prefix: 'НАК-',
    nakladnaya_next_number: '1',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        setSettings({
          invoice_prefix: data.invoice_prefix || 'INV-',
          invoice_next_number: data.invoice_next_number || '0001',
          default_currency: data.default_currency || 'KZT',
          default_due_days: data.default_due_days || '3',
          default_note: data.default_note || '',
          vat_type: data.vat_type || 'no_vat',
          kp_prefix: data.kp_prefix || 'КП-',
          kp_next_number: String(data.kp_next_number || 1),
          avr_prefix: data.avr_prefix || 'АВР-',
          avr_next_number: String(data.avr_next_number || 1),
          nakladnaya_prefix: data.nakladnaya_prefix || 'НАК-',
          nakladnaya_next_number: String(data.nakladnaya_next_number || 1),
        })
      }
      setLoaded(true)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      ...settings,
      kp_next_number: parseInt(settings.kp_next_number) || 1,
      avr_next_number: parseInt(settings.avr_next_number) || 1,
      nakladnaya_next_number: parseInt(settings.nakladnaya_next_number) || 1,
    })
    if (error) alert(t.errorPrefix(error.message))
    else { alert(t.savedAlert); router.push('/profile') }
    setSaving(false)
  }

  const vatLabels: Record<string, { label: string; desc: string; color: string }> = {
    no_vat: { label: t.vatNoLabel, desc: t.vatNoDesc, color: 'border-gray-300 text-gray-600' },
    vat_0: { label: t.vat0Label, desc: t.vat0Desc, color: 'border-blue-400 text-blue-600' },
    vat_16: { label: t.vat16Label, desc: t.vat16Desc, color: 'border-[#1C2056] text-[#1C2056]' },
  }

  if (!loaded) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">{t.invoiceSettingsLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Нумерация счетов */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide">{t.invoiceNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.prefixFieldLabel}</label>
              <input className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder="INV-" value={settings.invoice_prefix}
                onChange={e => setSettings({ ...settings, invoice_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.nextNumberFieldLabel}</label>
              <input className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder="0001" value={settings.invoice_next_number}
                onChange={e => setSettings({ ...settings, invoice_next_number: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t.defaultCurrencyFieldLabel}</label>
            <select className="w-full border-b border-gray-200 py-2 text-sm outline-none"
              value={settings.default_currency}
              onChange={e => setSettings({ ...settings, default_currency: e.target.value })}>
              <option>KZT</option>
              <option>USD</option>
              <option>EUR</option>
              <option>RUB</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t.defaultDueDaysFieldLabel}</label>
            <input type="number"
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
              placeholder="3" value={settings.default_due_days}
              onChange={e => setSettings({ ...settings, default_due_days: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t.defaultNoteFieldLabel}</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1C2056] resize-none"
              rows={3} placeholder={t.defaultNotePlaceholder}
              value={settings.default_note}
              onChange={e => setSettings({ ...settings, default_note: e.target.value })} />
          </div>
        </div>

        {/* Нумерация КП */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide">{t.kpNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.prefixFieldLabel}</label>
              <input className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder="КП-" value={settings.kp_prefix}
                onChange={e => setSettings({ ...settings, kp_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.nextNumberFieldLabel}</label>
              <input type="number"
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder="1" value={settings.kp_next_number}
                onChange={e => setSettings({ ...settings, kp_next_number: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Нумерация АВР */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide">{t.avrNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.prefixFieldLabel}</label>
              <input className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder="АВР-" value={settings.avr_prefix}
                onChange={e => setSettings({ ...settings, avr_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.nextNumberFieldLabel}</label>
              <input type="number"
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder="1" value={settings.avr_next_number}
                onChange={e => setSettings({ ...settings, avr_next_number: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Нумерация Накладной */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide">{t.nakladnayaNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.prefixFieldLabel}</label>
              <input className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder="НАК-" value={settings.nakladnaya_prefix}
                onChange={e => setSettings({ ...settings, nakladnaya_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.nextNumberFieldLabel}</label>
              <input type="number"
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-[#1C2056]"
                placeholder="1" value={settings.nakladnaya_next_number}
                onChange={e => setSettings({ ...settings, nakladnaya_next_number: e.target.value })} />
            </div>
          </div>
        </div>

        {/* НДС */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">{t.vatStatusSectionLabel}</div>
          <div className="space-y-2">
            {Object.entries(vatLabels).map(([key, val]) => (
              <div key={key} onClick={() => setSettings({ ...settings, vat_type: key })}
                className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition ${
                  settings.vat_type === key ? 'bg-gray-50 ' + val.color : 'border-gray-100 text-gray-400'
                }`}>
                <div>
                  <div className={`text-sm font-medium ${settings.vat_type === key ? '' : 'text-gray-600'}`}>
                    {val.label}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{val.desc}</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  settings.vat_type === key ? 'border-[#1C2056] bg-[#1C2056]' : 'border-gray-300'
                }`}>
                  {settings.vat_type === key && <div className="w-2 h-2 rounded-full bg-white"></div>}
                </div>
              </div>
            ))}
          </div>
          {settings.vat_type === 'vat_16' && (
            <div className="mt-3 bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
              {t.vat16InfoText}
            </div>
          )}
          {settings.vat_type === 'vat_0' && (
            <div className="mt-3 bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
              {t.vat0InfoText}
            </div>
          )}
          {settings.vat_type === 'no_vat' && (
            <div className="mt-3 bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
              {t.noVatInfoText}
            </div>
          )}
        </div>

        <button onClick={save} disabled={saving}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
          {saving ? t.savingEllipsis : t.saveSettingsButton}
        </button>
      </div>
    </main>
  )
}