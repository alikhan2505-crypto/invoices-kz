'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    async function handleCallback() {
      try {
        // Для Google OAuth — обменяем code на сессию
        const params = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
        
        const code = params.get('code')
        const accessToken = hashParams.get('access_token')
        const error = params.get('error') || hashParams.get('error')

        if (error) {
          console.error('Auth error:', error)
          router.push('/login')
          return
        }

        if (code) {
          // Google OAuth flow
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('Exchange error:', exchangeError)
            router.push('/login')
            return
          }
        } else if (accessToken) {
          // Magic link flow — уже в сессии
        }

        // Проверяем сессию
        await new Promise(resolve => setTimeout(resolve, 500))
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          router.push('/login')
          return
        }

        // Проверяем профиль
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_name')
          .eq('id', session.user.id)
          .single()

        if (!profile?.company_name) {
          const ref = localStorage.getItem('referral_code')
          router.push(ref ? `/onboarding?ref=${ref}` : '/onboarding')
        } else {
          router.push('/dashboard')
        }

      } catch (err) {
        console.error('Callback error:', err)
        router.push('/login')
      }
    }

    handleCallback()
  }, [router])

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-gray-500">Входим в систему...</p>
      </div>
    </main>
  )
}