'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { authDict } from '@/lib/i18n/auth'
import { hasPendingUpgrade } from '@/lib/pendingUpgrade'
import { consumePostLoginRedirect } from '@/lib/postLoginRedirect'

export default function AuthCallback() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = authDict[lang]

  useEffect(() => {
    async function handleCallback() {
      try {
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
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('Exchange error:', exchangeError)
            router.push('/login')
            return
          }
        } else if (accessToken) {
          // Magic link — сессия уже есть
        }

        // Ждём дольше чтобы сессия успела установиться
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Пробуем получить сессию несколько раз
        let session = null
        for (let i = 0; i < 5; i++) {
          const { data } = await supabase.auth.getSession()
          if (data.session) {
            session = data.session
            break
          }
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        if (!session) {
          console.error('No session after retries')
          router.push('/login')
          return
        }

        // Проверяем профиль по bin_iin (надёжнее чем company_name)
        const { data: profile } = await supabase
          .from('profiles')
          .select('bin_iin, company_name')
          .eq('id', session.user.id)
          .single()

        if (!profile?.bin_iin) {
          // New/incomplete profile: must finish onboarding first, so a
          // pending upgrade is left untouched for /upgrade to pick up
          // whenever the user gets there later -- never skip onboarding.
          const ref = localStorage.getItem('referral_code')
          router.push(ref ? `/onboarding?ref=${ref}` : '/onboarding')
        } else if (hasPendingUpgrade()) {
          // Already-onboarded account signing back in via magic link/Google/
          // Facebook -- safe to send straight to /upgrade when the landing
          // page's pricing CTA left one pending (see src/lib/pendingUpgrade.ts).
          // Checked before the generic postLoginRedirect below since it
          // carries a plan+period payload /upgrade's own mount effect still
          // needs to consume -- no regression from adding the generic path.
          router.replace('/upgrade')
        } else {
          // Generic "return to the page that sent the user to /login" --
          // e.g. /kaspi-api/docs's auth guard (see
          // src/lib/postLoginRedirect.ts). Falls back to the unchanged
          // default (/dashboard) when nothing was recorded.
          const redirect = consumePostLoginRedirect()
          if (redirect) router.replace(redirect)
          else router.push('/dashboard')
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
        <p className="text-gray-500">{t.loggingInMessage}</p>
      </div>
    </main>
  )
}