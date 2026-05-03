'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) localStorage.setItem('referral_code', ref)
  }, [])

  async function sendLink() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: 'https://invoices.kz/auth/callback' }
    })
    if (error) {
      alert('Ошибка: ' + error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://invoices.kz/auth/callback' }
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-[#1C2056] mb-1">INVOICES.KZ</h1>
        <p className="text-gray-500 text-sm mb-8">Создавайте счета за 1 минуту</p>

        {!sent ? (
          <>
            <label className="text-xs text-gray-500 mb-2 block">Email</label>
            <input
              className="w-full border rounded-lg px-3 py-3 text-sm outline-none focus:border-[#1C2056] mb-4"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <button
              onClick={sendLink}
              disabled={loading}
              className="w-full bg-[#2DC48D] text-white rounded-lg py-3 font-medium text-sm mb-4"
            >
              {loading ? 'Отправка...' : 'Получить ссылку для входа'}
            </button>

            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-xs text-gray-400">или</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            <button
              onClick={signInWithGoogle}
              className="w-full border border-gray-200 rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-3 hover:bg-gray-50 transition"
            >
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 32.8 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.7-3.1-11.3-7.7l-6.5 5C9.6 39.5 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C40.9 35.4 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
              Войти через Google
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <p className="font-medium text-[#1C2056] mb-2">Проверьте почту!</p>
            <p className="text-sm text-gray-500">Мы отправили ссылку для входа на<br/><strong>{email}</strong></p>
            <button onClick={() => setSent(false)} className="text-sm text-gray-400 mt-6">
              Изменить email
            </button>
          </div>
        )}
      </div>
    </main>
  )
}