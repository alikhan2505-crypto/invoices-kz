'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'

type LoginState = { code: string; botUsername: string; qrDataUrl: string | null }

// Заглушка этапа 2: только вход через Telegram QR. Сам планировщик
// (черновики броней, расписание, ручной ввод) добавляется на этапе 4 поверх
// этой же страницы -- см. C:\Users\Abilbayev.Alikhan\.claude\plans\smooth-wishing-pumpkin.md.
export default function PlannerPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState<{ salonName: string } | null>(null)
  const [login, setLogin] = useState<LoginState | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function startLogin() {
    setError(null)
    const res = await fetch('/api/planner/login/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error === 'not_found' ? 'Салон не найден' : 'Не удалось начать вход')
      return
    }
    const qrDataUrl = await QRCode
      .toDataURL(`https://t.me/${data.botUsername}?start=planner_${data.code}`, { width: 220, margin: 1 })
      .catch(() => null)
    setLogin({ code: data.code, botUsername: data.botUsername, qrDataUrl })
  }

  async function checkSession() {
    const res = await fetch('/api/planner/session')
    if (res.ok) {
      const data = await res.json()
      setAuthed({ salonName: data.salonName })
      setLogin(null)
    } else {
      setAuthed(null)
      await startLogin()
    }
    setChecking(false)
  }

  useEffect(() => {
    if (!slug) return
    void checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Опрос без ограничения на число попыток -- стабильное состояние этого
  // экрана (планшет на ресепшене) это и есть "сидеть на этой странице",
  // в отличие от разового платёжного QR, который логично бросать ждать
  // через N минут.
  useEffect(() => {
    if (!login) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/planner/login/status?code=${login.code}`)
      const data = await res.json()
      if (data.status === 'confirmed') {
        clearInterval(interval)
        void checkSession()
      } else if (data.status === 'expired') {
        clearInterval(interval)
        void startLogin()
      }
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login?.code])

  if (checking) {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-sm text-gray-400">
        Загрузка…
      </main>
    )
  }

  if (authed) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-lg font-semibold">Планировщик — {authed.salonName}</h1>
          <p className="text-sm text-gray-400 mt-2">Вход подтверждён. Черновики броней и расписание появятся здесь на следующем этапе.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-lg font-semibold">Вход в планировщик</h1>
        <p className="text-sm text-gray-400">Откройте Telegram на телефоне и отсканируйте QR-код — это подтвердит, что вы владелец салона.</p>
        {error && <div className="text-sm text-red-400">{error}</div>}
        {login?.qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image тут не помогает
          <img src={login.qrDataUrl} alt="QR для входа в планировщик" className="mx-auto rounded-xl bg-white p-3" />
        ) : (
          <div className="text-sm text-gray-500">Готовлю QR…</div>
        )}
      </div>
    </main>
  )
}
