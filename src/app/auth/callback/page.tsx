'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    async function handleCallback() {
      // Ждём пока Supabase обработает токен из URL
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        const { data } = await supabase
          .from('profiles')
          .select('company_name')
          .eq('id', session.user.id)
          .single()

        if (!data?.company_name) {
          router.push('/onboarding')
        } else {
          router.push('/dashboard')
        }
      } else {
        // Подождём немного и попробуем снова
        setTimeout(async () => {
          const { data: { session: session2 } } = await supabase.auth.getSession()
          if (session2) {
            const { data } = await supabase
              .from('profiles')
              .select('company_name')
              .eq('id', session2.user.id)
              .single()

            if (!data?.company_name) {
              router.push('/onboarding')
            } else {
              router.push('/dashboard')
            }
          } else {
            router.push('/login')
          }
        }, 2000)
      }
    }

    handleCallback()
  }, [router])

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-spin">⏳</div>
        <p className="text-gray-500">Входим в систему...</p>
      </div>
    </main>
  )
}