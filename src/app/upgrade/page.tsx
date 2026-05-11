'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Upgrade() {
  const router = useRouter()
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoSuccess, setPromoSuccess] = useState('')
  const [promoError, setPromoError] = useState('')
  const [plan, setPlan] = useState('free')
  const [userId, setUserId] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; amount: number; plan: string } | null>(null)
  const [step, setStep] = useState<'pending' | 'success'>('pending')
  const [submitting, setSubmitting] = useState(false)
  const [qrToken, setQrToken] = useState('')
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [payPhone, setPayPhone] = useState('')
  const [phoneSubmitting, setPhoneSubmitting] = useState(false)
  const statusInterval = useRef<any>(null)

  useEffect(() => {
    loadData()
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    return () => { if (statusInterval.current) clearInterval(statusInterval.current) }
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: p } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
    setPlan(p?.plan || 'free')
  }

  async function reloadPlan() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: p } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
    setPlan(p?.plan || 'free')
  }

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    let result = '+7'
    if (digits.length > 1) result += ' ' + digits.slice(1, 4)
    if (digits.length > 4) result += ' ' + digits.slice(4, 7)
    if (digits.length > 7) result += ' ' + digits.slice(7, 9)
    if (digits.length > 9) result += ' ' + digits.slice(9, 11)
    return result
  }

  async function openModal(planName: string, amount: number, planKey: string) {
    setSelectedPlan({ name: planName, amount, plan: planKey })
    setQrToken('')
    setStep('pending')
    setShowModal(true)
    setSubmitting(true)

    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plan: planKey })
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        alert('Ошибка: ' + (data.error || 'Попробуйте снова'))
        setShowModal(false)
        setSubmitting(false)
        return
      }

      setQrToken(data.qr_token)

      if (isMobile) {
        window.location.href = data.qr_token
      }

      statusInterval.current = setInterval(() => checkPaymentStatus(planKey), 5000)

    } catch (e: any) {
      alert('Ошибка: ' + (e.message || 'Попробуйте снова'))
      setShowModal(false)
    }
    setSubmitting(false)
  }

  async function checkPaymentStatus(planKey: string) {
    setCheckingStatus(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('profiles').select('plan, plan_expires_at').eq('id', user.id).single()
      if (p?.plan === planKey && p?.plan_expires_at) {
        const expiresAt = new Date(p.plan_expires_at)
        if (expiresAt > new Date()) {
          clearInterval(statusInterval.current)
          setPlan(p.plan)
          setStep('success')
        }
      }
    } catch {}
    setCheckingStatus(false)
  }

  async function createPhonePayment() {
    if (!payPhone || payPhone.length < 16) {
      alert('Введите полный номер телефона')
      return
    }
    setPhoneSubmitting(true)
    try {
      const res = await fetch('/api/payment/create-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          plan: selectedPlan?.plan,
          phone: payPhone.replace(/\s/g, ''),
        })
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        alert('Ошибка: ' + (data.error || 'Попробуйте снова'))
        setPhoneSubmitting(false)
        return
      }
      setShowPhoneModal(false)
      alert('✅ Запрос отправлен! Откройте Kaspi и подтвердите оплату.')
    } catch (e: any) {
      alert('Ошибка: ' + e.message)
    }
    setPhoneSubmitting(false)
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
    if (promo.used_count >= promo.max_uses) { setPromoError('Промокод уже использован'); setPromoLoading(false); return }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + promo.days)
    await supabase.from('profiles').update({ plan: promo.plan, plan_expires_at: expiresAt.toISOString() }).eq('id', user.id)
    await supabase.from('promo_codes').update({ used_count: promo.used_count + 1 }).eq('id', promo.id)

    setPromoSuccess(`🎉 Промокод активирован! ${promo.plan === 'pro' ? 'Про' : 'Базовый'} тариф на ${promo.days} дней`)
    setPromoCode('')
    setPromoLoading(false)
    await reloadPlan()
  }

  function ConnectButton({ planName, amount, planKey, dark }: {
    planName: string; amount: number; planKey: string; dark?: boolean
  }) {
    return (
      <button onClick={() => openModal(planName, amount, planKey)}
        className={`w-full rounded-xl py-3.5 font-medium text-sm ${dark
          ? 'bg-[#2DC48D] text-white'
          : 'border-2 border-[#1C2056] text-[#1C2056]'
        }`}>
        Подключить за {amount.toLocaleString('ru-KZ')} ₸/мес
      </button>
    )
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
          <p className="text-gray-400 text-sm">Оплата через Kaspi Pay · Активация моментально</p>
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
            {['7 дней бесплатного периода', 'PDF генерация', 'История счетов', 'Публичная ссылка'].map(f => (
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
            {['30 счетов в месяц', 'PDF с подписью и печатью', 'Справочник клиентов', 'Услуги и товары', 'Отправка через WhatsApp', 'Поддержка в Telegram'].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="text-[#2DC48D]">✓</span> {f}
              </li>
            ))}
          </ul>
          {plan !== 'basic' && plan !== 'pro' && <ConnectButton planName="Базовый" amount={2990} planKey="basic" />}
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
          {plan !== 'pro' && <ConnectButton planName="Про" amount={5990} planKey="pro" dark />}
          {plan === 'pro' && <div className="text-center text-sm text-white/60 py-2">✓ Активен</div>}
        </div>

        <p className="text-center text-xs text-gray-400">
          Вопросы?{' '}
          <a href="https://t.me/invoiceskz_support" target="_blank" className="text-[#1C2056] underline">
            Написать в Telegram
          </a>
        </p>
      </div>

      {/* Modal QR */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6">

            {submitting && (
              <div className="text-center py-8">
                <div className="w-10 h-10 border-2 border-[#1C2056] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <div className="font-semibold text-[#1C2056] mb-1">Создаём платёж...</div>
                <div className="text-xs text-gray-400">Подождите несколько секунд</div>
              </div>
            )}

            {!submitting && step === 'pending' && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div className="font-semibold text-[#1C2056]">Оплата {selectedPlan?.name}</div>
                  <button onClick={() => {
                    clearInterval(statusInterval.current)
                    setShowModal(false)
                  }} className="text-gray-400 text-xl">✕</button>
                </div>

                {isMobile ? (
                  <div className="text-center py-4">
                    <div className="text-5xl mb-4">📱</div>
                    <div className="font-semibold text-[#1C2056] mb-2">Переходим в Kaspi...</div>
                    <div className="text-sm text-gray-400 mb-4">
                      Если приложение не открылось — нажмите кнопку ниже
                    </div>
                    <a href={qrToken} target="_blank"
                      className="block w-full bg-[#2DC48D] text-white rounded-xl py-4 font-medium text-sm mb-3">
                      💳 Открыть Kaspi
                    </a>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-px bg-gray-100"></div>
                      <span className="text-xs text-gray-400">или</span>
                      <div className="flex-1 h-px bg-gray-100"></div>
                    </div>
                    <button onClick={() => setShowPhoneModal(true)}
                      className="w-full border border-[#1C2056] text-[#1C2056] rounded-xl py-3 text-sm font-medium">
                      📲 Отправить запрос на телефон
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <div className="font-semibold text-[#1C2056] mb-1">Отсканируйте QR в приложении Kaspi</div>
                    <div className="text-xs text-gray-400 mb-4">Или воспользуйтесь другим способом ниже</div>
                    {qrToken && (
                      <div className="flex justify-center mb-4">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrToken)}`}
                          alt="QR код"
                          className="rounded-xl border border-gray-100"
                          width={200}
                          height={200}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <a href={qrToken} target="_blank"
                        className="text-xs text-gray-400 underline">
                        Открыть ссылку напрямую
                      </a>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-gray-100"></div>
                        <span className="text-xs text-gray-400">или</span>
                        <div className="flex-1 h-px bg-gray-100"></div>
                      </div>
                      <button onClick={() => setShowPhoneModal(true)}
                        className="w-full border border-[#1C2056] text-[#1C2056] rounded-xl py-3 text-sm font-medium">
                        📲 Отправить запрос на телефон
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl px-4 py-3 mt-4 mb-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500">К оплате</span>
                  <span className="text-sm font-bold text-[#1C2056]">{selectedPlan?.amount.toLocaleString('ru-KZ')} ₸/мес</span>
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mb-3">
                  <div className="w-3 h-3 border-2 border-[#1C2056] border-t-transparent rounded-full animate-spin"></div>
                  {checkingStatus ? 'Проверяем оплату...' : 'Ожидаем подтверждение...'}
                </div>

                <button onClick={() => checkPaymentStatus(selectedPlan?.plan || '')}
                  className="w-full border border-gray-200 text-gray-500 rounded-xl py-3 text-sm">
                  🔄 Проверить вручную
                </button>
              </>
            )}

            {step === 'success' && (
              <div className="text-center py-6">
                <div className="text-5xl mb-4">🎉</div>
                <div className="font-bold text-[#1C2056] text-xl mb-2">Оплата прошла!</div>
                <div className="text-sm text-gray-400 mb-6">
                  Тариф <strong>{selectedPlan?.name}</strong> активирован
                </div>
                <div className="bg-green-50 rounded-2xl p-4 mb-6">
                  <div className="text-sm text-green-700">✅ Подписка активна на 30 дней</div>
                </div>
                <button onClick={() => {
                  setShowModal(false)
                  router.push('/dashboard')
                }}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
                  Перейти к работе →
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Модал ввода телефона */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="font-semibold text-[#1C2056]">Оплата по номеру телефона</div>
              <button onClick={() => setShowPhoneModal(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="bg-blue-50 rounded-2xl p-4 mb-5">
              <div className="text-xs text-gray-500 leading-relaxed">
                Введите номер телефона привязанный к Kaspi. На него придёт уведомление с запросом на оплату.
              </div>
            </div>

            <label className="text-xs text-gray-500 mb-1 block">Номер телефона Kaspi</label>
            <input
              className="w-full border rounded-lg px-3 py-3 text-sm outline-none focus:border-[#1C2056] mb-3"
              placeholder="+7 777 123 45 67"
              value={payPhone}
              onChange={e => setPayPhone(formatPhone(e.target.value))}
              type="tel"
              maxLength={16}
            />

            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">К оплате</span>
              <span className="text-sm font-bold text-[#1C2056]">{selectedPlan?.amount.toLocaleString('ru-KZ')} ₸/мес</span>
            </div>

            <button onClick={createPhonePayment} disabled={phoneSubmitting}
              className="w-full bg-[#2DC48D] text-white rounded-xl py-4 font-medium text-sm mb-2">
              {phoneSubmitting ? 'Отправляем...' : '📲 Отправить запрос в Kaspi'}
            </button>
            <button onClick={() => setShowPhoneModal(false)}
              className="w-full text-gray-400 text-sm py-2">
              Отмена
            </button>
          </div>
        </div>
      )}

    </main>
  )
}