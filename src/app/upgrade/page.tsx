'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Upgrade() {
  const router = useRouter()
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoSuccess, setPromoSuccess] = useState('')
  const [promoError, setPromoError] = useState('')
  const [plan, setPlan] = useState('free')

  useEffect(() => {
    async function loadPlan() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
      setPlan(data?.plan || 'free')
    }
    loadPlan()
  }, [promoSuccess])

  async function applyPromo() {
    if (!promoCode.trim()) { setPromoError('Введите промокод'); return }
    setPromoLoading(true)
    setPromoError('')
    setPromoSuccess('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: promo } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', promoCode.toUpperCase())
      .eq('is_active', true)
      .single()

    if (!promo) {
      setPromoError('Промокод не найден или недействителен')
      setPromoLoading(false)
      return
    }

    if (promo.used_count >= promo.max_uses) {
      setPromoError('Промокод уже использован максимальное количество раз')
      setPromoLoading(false)
      return
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + promo.days)

    await supabase.from('profiles').update({
      plan: promo.plan,
      plan_expires_at: expiresAt.toISOString(),
    }).eq('id', user.id)

    await supabase.from('promo_codes').update({
      used_count: promo.used_count + 1
    }).eq('id', promo.id)

    setPromoSuccess(`🎉 Промокод активирован! ${promo.plan === 'pro' ? 'Про' : 'Базовый'} тариф на ${promo.days} дней`)
    setPromoCode('')
    setPromoLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Тарифы</span>
      </div>

      <div className="max-w-lg mx-auto p-6 flex-1">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🚀</div>
          <h1 className="text-2xl font-bold text-[#1C2056] mb-2">Выберите тариф</h1>
          <p className="text-gray-400 text-sm">Бесплатно — 3 счёта в месяц</p>
        </div>

        {/* Promo code */}
        <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
          <div className="text-sm font-medium text-[#1C2056] mb-3">🎟️ Есть промокод?</div>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056] uppercase"
              placeholder="Введите промокод"
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); setPromoSuccess('') }}
            />
            <button
              onClick={applyPromo}
              disabled={promoLoading}
              className="bg-[#1C2056] text-white px-4 py-2.5 rounded-lg text-sm font-medium">
              {promoLoading ? '...' : 'Применить'}
            </button>
          </div>
          {promoError && <p className="text-xs text-red-500 mt-2">{promoError}</p>}
          {promoSuccess && <p className="text-xs text-[#2DC48D] mt-2 font-medium">{promoSuccess}</p>}
        </div>

        {/* Free */}
        <div className={`bg-white rounded-2xl p-5 mb-4 shadow-sm border-2 ${plan === 'free' ? 'border-[#1C2056]' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#1C2056]">Бесплатно</div>
            {plan === 'free' && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Текущий</span>
            )}
          </div>
          <div className="text-2xl font-bold text-[#1C2056] mb-3">0 ₸</div>
          <ul className="space-y-2">
            {['3 счёта в месяц', 'PDF генерация', 'История счетов', 'Профиль компании'].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-500">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Basic */}
        <div className={`bg-white rounded-2xl p-5 mb-4 shadow-sm border-2 ${plan === 'basic' ? 'border-[#1C2056]' : 'border-[#1C2056]/20'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#1C2056]">Базовый</div>
            {plan === 'basic' ? (
              <span className="text-xs bg-[#1C2056] text-white px-2 py-1 rounded-full">Текущий</span>
            ) : (
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">Популярный</span>
            )}
          </div>
          <div className="text-2xl font-bold text-[#1C2056] mb-3">
            2 990 ₸<span className="text-sm font-normal text-gray-400">/мес</span>
          </div>
          <ul className="space-y-2 mb-5">
            {[
              '30 счетов в месяц',
              'PDF с подписью и печатью',
              'Справочник клиентов',
              'Услуги и товары',
              'Отправка на Email',
              'Поддержка в WhatsApp',
            ].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
          {plan !== 'basic' && plan !== 'pro' && (
            <button
              onClick={() => window.open('https://wa.me/77763555177?text=Хочу подключить Базовый тариф INVOICES.KZ', '_blank')}
              className="w-full border-2 border-[#1C2056] text-[#1C2056] rounded-xl py-3.5 font-medium text-sm">
              Подключить за 2 990 ₸/мес
            </button>
          )}
          {plan === 'basic' && (
            <div className="w-full text-center text-sm text-gray-400 py-2">✓ Активен</div>
          )}
          {plan === 'pro' && (
            <div className="w-full text-center text-sm text-gray-400 py-2">У вас более высокий тариф</div>
          )}
        </div>

        {/* Pro */}
        <div className={`rounded-2xl p-5 mb-6 ${plan === 'pro' ? 'bg-[#1C2056] ring-2 ring-[#2DC48D]' : 'bg-[#1C2056]'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-white text-lg">Про</div>
            {plan === 'pro' ? (
              <span className="text-xs bg-[#2DC48D] text-white px-2 py-1 rounded-full">Текущий</span>
            ) : (
              <span className="text-xs bg-[#2DC48D] text-white px-2 py-1 rounded-full">Максимум</span>
            )}
          </div>
          <div className="text-2xl font-bold text-white mb-3">
            5 990 ₸<span className="text-sm font-normal text-white/60">/мес</span>
          </div>
          <ul className="space-y-2 mb-5">
            {[
              'Безлимитные счета',
              'ЭЦП НУЦ РК подпись',
              'Шаблоны счетов',
              'PDF с подписью и печатью',
              'Отправка на Email и WhatsApp',
              'Аналитика и отчёты',
              'Приоритетная поддержка 24/7',
            ].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
          {plan !== 'pro' ? (
            <button
              onClick={() => window.open('https://wa.me/77763555177?text=Хочу подключить Про тариф INVOICES.KZ', '_blank')}
              className="w-full bg-[#2DC48D] text-white rounded-xl py-3.5 font-medium text-sm">
              Подключить за 5 990 ₸/мес
            </button>
          ) : (
            <div className="w-full text-center text-sm text-white/60 py-2">✓ Активен</div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Оплата через Kaspi или перевод.{' '}
          <a href="https://wa.me/77763555177" target="_blank" className="text-[#1C2056] underline">
            Написать нам
          </a>
        </p>
      </div>
    </main>
  )
}