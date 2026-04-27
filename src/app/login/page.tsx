'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

async function sendLink() {
  setLoading(true)
  const { error } = await supabase.auth.signInWithOtp({ 
    email,
    options: { emailRedirectTo: 'http://localhost:3000/dashboard' }
  })
  if (error) {
    alert('Ошибка: ' + error.message)
  } else {
    setSent(true)
  }
  setLoading(false)
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
              className="w-full bg-[#2DC48D] text-white rounded-lg py-3 font-medium text-sm"
            >
              {loading ? 'Отправка...' : 'Получить ссылку для входа'}
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