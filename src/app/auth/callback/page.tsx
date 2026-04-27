'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
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
        router.push('/login')
      }
    })
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