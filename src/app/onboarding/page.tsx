'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Onboarding() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState('')
  const [refCode, setRefCode] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [accountType, setAccountType] = useState<'ИП' | 'ТОО' | 'Физлицо'>('ИП')
  const [form, setForm] = useState({ company_name: '', bin_iin: '', email: '' })
  const [bank, setBank] = useState({ bank_name: '', iik: '', bik: '', kbe: '19' })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refFromUrl = params.get('ref')
    if (refFromUrl) localStorage.setItem('referral_code', refFromUrl)
    const ref = refFromUrl || localStorage.getItem('referral_code') || ''
    setRefCode(ref)

    const promoFromUrl = params.get('promo')
    if (promoFromUrl) localStorage.setItem('promo_code', promoFromUrl)
    const promoFromStorage = localStorage.getItem('promo_code')
    const promo = promoFromUrl || promoFromStorage || ''
    setPromoCode(promo)

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
      else setUserId(user.id)
    })

  }, [])

  async function saveStep1() {
    if (!form.company_name) { alert('Введите название'); return }
    if (!form.bin_iin) { alert('Введите БИН/ИИН'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const trialExpires = new Date()
    trialExpires.setDate(trialExpires.getDate() + 7)
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      company_name: form.company_name,
      bin_iin: form.bin_iin,
      email: form.email || user.email,
      account_type: accountType,
      trial_expires_at: trialExpires.toISOString(),
    })
    if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }
    if (refCode) {
      try {
        await fetch('/api/referral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, referralCode: refCode })
        })
      } catch {}
      localStorage.removeItem('referral_code')
    }

    if (promoCode) {
      try {
        const { data: promo } = await supabase
          .from('promo_codes')
          .select('*')
          .eq('code', promoCode.toUpperCase())
          .eq('is_active', true)
          .single()
        if (promo) {
          const bonusExpires = new Date()
          bonusExpires.setDate(bonusExpires.getDate() + (promo.bonus_days || 14))
          await supabase.from('profiles').update({
            bonus_expires_at: bonusExpires.toISOString(),
          }).eq('id', user.id)
        }
      } catch {}
      localStorage.removeItem('promo_code')
    }   


    try {
      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `🆕 <b>Новый пользователь!</b>\n👤 ${form.company_name}\n🔢 БИН: ${form.bin_iin}\n📧 ${user?.email}${refCode ? '\n🎁 Реферал: ' + refCode : ''}`
        })
      })
    } catch {}
    setSaving(false)
    setStep(2)
  }

  async function saveStep2() {
    if (bank.iik && bank.bank_name) {
      setSaving(true)
      await supabase.from('bank_accounts').insert({
        user_id: userId,
        bank_name: bank.bank_name,
        iik: bank.iik,
        bik: bank.bik,
        kbe: bank.kbe,
        is_main: true,
      })
      setSaving(false)
    }
    setStep(3)
  }

  async function finish() {
    router.push('/dashboard')
  }

  const steps = [
    { n: 1, label: 'Компания' },
    { n: 2, label: 'Банк' },
    { n: 3, label: 'Подпись' },
  ]

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-[#1C2056] mb-1">INVOICES.KZ</div>
          <p className="text-sm text-gray-400">Настройка займёт 2 минуты</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step > s.n ? 'bg-[#2DC48D] text-white' :
                  step === s.n ? 'bg-[#1C2056] text-white' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {step > s.n ? '✓' : s.n}
                </div>
                <span className={`text-xs ${step === s.n ? 'text-[#1C2056] font-medium' : 'text-gray-400'}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-12 h-px mb-4 ${step > s.n ? 'bg-[#2DC48D]' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold text-[#1C2056] mb-1">Данные компании</h2>
            <p className="text-xs text-gray-400 mb-5">Они появятся на всех ваших счетах</p>

            {refCode && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-4 text-center">
                <span className="text-xs text-green-700">🎁 Реферальный бонус будет начислен</span>
              </div>
            )}

            {promoCode && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-center">
                <span className="text-xs text-blue-700">🎁 Промокод <b>{promoCode}</b> будет применён</span>
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-2 block">Тип аккаунта</label>
              <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1 rounded-xl">
                {(['ИП', 'ТОО', 'Физлицо'] as const).map(type => (
                  <button key={type} onClick={() => setAccountType(type)}
                    className={`py-2 rounded-lg text-sm font-medium transition ${accountType === type ? 'bg-white text-[#1C2056] shadow-sm' : 'text-gray-400'}`}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  {accountType === 'ТОО' ? 'Название ТОО' : accountType === 'ИП' ? 'Название ИП' : 'ФИО'}
                </label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder={accountType === 'ТОО' ? 'ТОО «Пример»' : accountType === 'ИП' ? 'ИП Смагулов А.К.' : 'Смагулов Алихан'}
                  value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">БИН / ИИН</label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder="123456789012" value={form.bin_iin}
                  onChange={e => setForm({ ...form, bin_iin: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email для уведомлений</label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder="email@example.kz" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>

            <button onClick={saveStep1} disabled={saving}
              className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
              {saving ? 'Сохраняем...' : 'Далее →'}
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-[#1C2056] mb-1">Банковские реквизиты</h2>
            <p className="text-xs text-gray-400 mb-5">Нужны для PDF счетов. Можно добавить позже.</p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Название банка</label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder='АО "Kaspi Bank"' value={bank.bank_name}
                  onChange={e => setBank({ ...bank, bank_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ИИК (номер счёта)</label>
                <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                  placeholder="KZ..." value={bank.iik}
                  onChange={e => setBank({ ...bank, iik: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">БИК</label>
                  <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                    placeholder="CASPKZKA" value={bank.bik}
                    onChange={e => setBank({ ...bank, bik: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">КБе</label>
                  <input className="w-full border-b border-gray-200 py-2.5 text-sm outline-none focus:border-[#1C2056] transition"
                    placeholder="19" value={bank.kbe}
                    onChange={e => setBank({ ...bank, kbe: e.target.value })} />
                </div>
              </div>
            </div>

            <button onClick={saveStep2} disabled={saving}
              className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm mb-3">
              {saving ? 'Сохраняем...' : 'Далее →'}
            </button>
            <button onClick={() => setStep(3)}
              className="w-full text-gray-400 text-sm py-2">
              Пропустить
            </button>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-bold text-[#1C2056] mb-1">Подпись и печать</h2>
            <p className="text-xs text-gray-400 mb-5">Появятся на всех документах автоматически</p>

            <div className="bg-gray-50 rounded-2xl p-5 mb-6 space-y-3">
              {[
                { icon: '✍️', title: 'Подпись', desc: 'Нарисуйте или загрузите фото подписи' },
                { icon: '🔵', title: 'Печать', desc: 'Загрузите фото печати компании' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-[#1C2056]">{item.title}</div>
                    <div className="text-xs text-gray-400">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[#2DC48D]/10 rounded-xl p-4 mb-6 text-center">
              <div className="text-2xl mb-1">🎉</div>
              <div className="text-sm font-medium text-[#1C2056]">7 дней бесплатно активированы!</div>
              <div className="text-xs text-gray-400 mt-1">Все функции Pro открыты</div>
            </div>

            <button onClick={() => router.push('/profile/signature')}
              className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm mb-3">
              ✍️ Добавить подпись
            </button>
            <button onClick={finish}
              className="w-full text-gray-400 text-sm py-2">
              Пропустить — перейти в приложение
            </button>
          </div>
        )}

      </div>
    </main>
  )
}