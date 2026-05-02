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
  const [payEmail, setPayEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [existingRequest, setExistingRequest] = useState<any>(null)
  const [countdown, setCountdown] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; amount: number; plan: string } | null>(null)
  const [step, setStep] = useState<'instruction' | 'pending'>('instruction')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [promoSuccess])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: p } = await supabase.from('profiles').select('plan, email').eq('id', user.id).single()
    setPlan(p?.plan || 'free')
    setPayEmail(p?.email || user.email || '')

    // Проверяем заявку за последние 20 минут
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    const { data: req } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('created_at', twentyMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (req) {
      setExistingRequest(req)
      setStep('pending')
    }
  }

  // Обратный отсчёт
  useEffect(() => {
    if (!existingRequest) return
    const interval = setInterval(() => {
      const created = new Date(existingRequest.created_at).getTime()
      const expires = created + 20 * 60 * 1000
      const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining === 0) {
        setExistingRequest(null)
        setStep('instruction')
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [existingRequest])

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function openModal(planName: string, amount: number, planKey: string) {
    setSelectedPlan({ name: planName, amount, plan: planKey })

    // Если уже есть заявка — показываем pending
    if (existingRequest) {
      setStep('pending')
    } else {
      setStep('instruction')
    }
    setShowModal(true)
  }

  async function submitRequest() {
    if (!payEmail) { alert('Введите email'); return }
    setSubmitting(true)

    const { data: newReq, error } = await supabase.from('payment_requests').insert({
      user_id: userId,
      email: payEmail,
      plan: selectedPlan?.plan,
      amount: selectedPlan?.amount,
      status: 'pending',
    }).select().single()

    if (error) { alert('Ошибка: ' + error.message); setSubmitting(false); return }

    try {
      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `💳 <b>Новая заявка на оплату!</b>\n📧 ${payEmail}\n📦 ${selectedPlan?.name}\n💰 ${selectedPlan?.amount.toLocaleString('ru-KZ')} ₸`
        })
      })
    } catch {}

    setExistingRequest(newReq)
    setStep('pending')
    setSubmitting(false)

    // Открываем Kaspi Pay
    window.open('https://pay.kaspi.kz/pay/q3p5cvsl', '_blank')
  }

  async function applyPromo() {
    if (!promoCode.trim()) { setPromoError('Введите промокод'); return }
    setPromoLoading(true)
    setPromoError('')
    setPromoSuccess('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: promo } = await supabase
      .from('promo_codes').select('*')
      .eq('code', promoCode.toUpperCase())
      .eq('is_active', true).single()

    if (!promo) { setPromoError('Промокод не найден или недействителен'); setPromoLoading(false); return }
    if (promo.used_count >= promo.max_uses) { setPromoError('Промокод уже использован максимальное количество раз'); setPromoLoading(false); return }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + promo.days)

    await supabase.from('profiles').update({ plan: promo.plan, plan_expires_at: expiresAt.toISOString() }).eq('id', user.id)
    await supabase.from('promo_codes').update({ used_count: promo.used_count + 1 }).eq('id', promo.id)

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
          <p className="text-gray-400 text-sm">Без скрытых платежей · Активация до 20 минут</p>
        </div>

        {/* Promo */}
        <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
          <div className="text-sm font-medium text-[#1C2056] mb-3">🎟️ Есть промокод?</div>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056] uppercase"
              placeholder="Введите промокод"
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); setPromoSuccess('') }}
            />
            <button onClick={applyPromo} disabled={promoLoading}
              className="bg-[#1C2056] text-white px-4 py-2.5 rounded-lg text-sm font-medium">
              {promoLoading ? '...' : 'Применить'}
            </button>
          </div>
          {promoError && <p className="text-xs text-red-500 mt-2">{promoError}</p>}
          {promoSuccess && <p className="text-xs text-[#2DC48D] mt-2 font-medium">{promoSuccess}</p>}
        </div>

        {/* Free */}
        <div className={`bg-white border-2 rounded-2xl p-6 mb-4 ${plan === 'free' ? 'border-[#1C2056]' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#1C2056] text-lg">Бесплатно</div>
            {plan === 'free' && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Текущий</span>}
          </div>
          <div className="text-3xl font-bold text-[#1C2056] mb-4">0 ₸</div>
          <ul className="space-y-2">
            {['3 счёта в месяц', 'PDF генерация', 'История счетов', 'Публичная ссылка'].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Basic */}
        <div className={`bg-white border-2 rounded-2xl p-6 mb-4 ${plan === 'basic' ? 'border-[#1C2056]' : 'border-[#1C2056]/20'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#1C2056] text-lg">Базовый</div>
            {plan === 'basic'
              ? <span className="text-xs bg-[#1C2056] text-white px-2 py-1 rounded-full">Текущий</span>
              : <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">Популярный</span>}
          </div>
          <div className="text-3xl font-bold text-[#1C2056] mb-4">
            2 990 ₸<span className="text-sm font-normal text-gray-400">/мес</span>
          </div>
          <ul className="space-y-2 mb-5">
            {['30 счетов в месяц', 'PDF с подписью и печатью', 'Справочник клиентов', 'Услуги и товары', 'Отправка через WhatsApp', 'Поддержка в WhatsApp'].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
          {plan !== 'basic' && plan !== 'pro' && (
            <button onClick={() => openModal('Базовый', 2990, 'basic')}
              className="w-full border-2 border-[#1C2056] text-[#1C2056] rounded-xl py-3.5 font-medium text-sm">
              {existingRequest ? '📋 Посмотреть заявку' : 'Подключить за 2 990 ₸/мес'}
            </button>
          )}
          {plan === 'basic' && <div className="text-center text-sm text-gray-400 py-2">✓ Активен</div>}
          {plan === 'pro' && <div className="text-center text-sm text-gray-400 py-2">У вас более высокий тариф</div>}
        </div>

        {/* Pro */}
        <div className={`rounded-2xl p-6 mb-6 bg-[#1C2056] ${plan === 'pro' ? 'ring-2 ring-[#2DC48D]' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-white text-lg">Про</div>
            {plan === 'pro'
              ? <span className="text-xs bg-[#2DC48D] text-white px-2 py-1 rounded-full">Текущий</span>
              : <span className="text-xs bg-[#2DC48D] text-white px-2 py-1 rounded-full">Максимум</span>}
          </div>
          <div className="text-3xl font-bold text-white mb-4">
            5 990 ₸<span className="text-sm font-normal text-white/60">/мес</span>
          </div>
          <ul className="space-y-2 mb-5">
            {['Безлимитные счета', 'ЭЦП НУЦ РК (скоро)', 'Шаблоны счетов', 'PDF с подписью и печатью', 'Отправка на Email и WhatsApp', 'Аналитика и отчёты', 'Приоритетная поддержка 24/7'].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
          {plan !== 'pro' && (
            <button onClick={() => openModal('Про', 5990, 'pro')}
              className="w-full bg-[#2DC48D] text-white rounded-xl py-3.5 font-medium text-sm">
              {existingRequest ? '📋 Посмотреть заявку' : 'Подключить за 5 990 ₸/мес'}
            </button>
          )}
          {plan === 'pro' && <div className="text-center text-sm text-white/60 py-2">✓ Активен</div>}
        </div>

        <p className="text-center text-xs text-gray-400">
          Вопросы?{' '}
          <a href="https://wa.me/77763555177" target="_blank" className="text-[#1C2056] underline">
            Написать в WhatsApp
          </a>
        </p>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6">

            {step === 'instruction' && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div className="font-semibold text-[#1C2056]">
                    Подключить тариф {selectedPlan?.name}
                  </div>
                  <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl">✕</button>
                </div>

                <div className="bg-blue-50 rounded-2xl p-4 mb-5">
                  <div className="text-sm font-medium text-[#1C2056] mb-3">📋 Инструкция по оплате</div>
                  <div className="space-y-3">
                    {[
                      { step: '1', text: 'Нажмите кнопку "Перейти к оплате" — откроется Kaspi Pay' },
                      { step: '2', text: `Оплатите ${selectedPlan?.amount.toLocaleString('ru-KZ')} ₸` },
                      { step: '3', text: 'Вернитесь сюда и нажмите "Я оплатил"' },
                      { step: '4', text: 'Тариф будет активирован в течение 20 минут' },
                    ].map(item => (
                      <div key={item.step} className="flex gap-3 items-start">
                        <div className="w-6 h-6 rounded-full bg-[#1C2056] text-white text-xs flex items-center justify-center flex-shrink-0">
                          {item.step}
                        </div>
                        <span className="text-sm text-gray-600">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <label className="text-xs text-gray-500 mb-1 block">Email для уведомления об активации</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1C2056]"
                    placeholder="your@email.kz"
                    value={payEmail}
                    onChange={e => setPayEmail(e.target.value)}
                  />
                </div>

                <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
                  <span className="text-sm text-gray-500">К оплате</span>
                  <span className="text-lg font-bold text-[#1C2056]">{selectedPlan?.amount.toLocaleString('ru-KZ')} ₸/мес</span>
                </div>

                <button onClick={submitRequest} disabled={submitting}
                  className="w-full bg-[#2DC48D] text-white rounded-xl py-4 font-medium text-sm mb-3">
                  {submitting ? 'Оформляем...' : '💳 Перейти к оплате в Kaspi →'}
                </button>

                <p className="text-center text-xs text-gray-400">
                  Передумали? Просто закройте окно и не проводите оплату
                </p>
              </>
            )}

            {step === 'pending' && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div className="font-semibold text-[#1C2056]">Статус заявки</div>
                  <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl">✕</button>
                </div>

                <div className="bg-yellow-50 rounded-2xl p-4 mb-5">
                  <div className="text-sm font-medium text-yellow-800 mb-2">⏳ Заявка на обработке</div>
                  <div className="text-sm text-yellow-700 mb-1">
                    Тариф: <b>{existingRequest?.plan === 'pro' ? 'Про' : 'Базовый'}</b>
                  </div>
                  <div className="text-sm text-yellow-700 mb-1">
                    Сумма: <b>{existingRequest?.amount?.toLocaleString('ru-KZ')} ₸</b>
                  </div>
                  <div className="text-sm text-yellow-700 mb-3">
                    Подана: <b>{existingRequest ? new Date(existingRequest.created_at).toLocaleTimeString('ru-KZ') : ''}</b>
                  </div>
                  <div className="bg-yellow-100 rounded-xl px-4 py-2 flex items-center justify-between">
                    <span className="text-xs text-yellow-700">Тариф будет активирован в течение 20 минут с момента оплаты</span>
                  </div>
                </div>

                {countdown > 0 && (
                  <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Новую заявку можно подать через</span>
                    <span className="text-lg font-bold text-[#1C2056]">{formatCountdown(countdown)}</span>
                  </div>
                )}

                <button
                  onClick={() => window.open('https://pay.kaspi.kz/pay/q3p5cvsl', '_blank')}
                  className="w-full bg-[#2DC48D] text-white rounded-xl py-4 font-medium text-sm mb-3">
                  💳 Перейти к оплате в Kaspi
                </button>

                <button
                  onClick={() => setShowModal(false)}
                  className="w-full bg-gray-100 text-gray-500 rounded-xl py-3 text-sm mb-3">
                  ✅ Я уже оплатил — жду активации
                </button>

                <p className="text-center text-xs text-gray-400">
                  Если передумали — просто не проводите оплату. Заявка аннулируется автоматически.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}