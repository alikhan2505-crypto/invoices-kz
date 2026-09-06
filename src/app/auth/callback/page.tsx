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

        // `id` (not bin_iin) because the question this branch asks is "does a
        // profile row exist at all", not "are the invoice requisites filled".
        // A Kaspi-Shop-only user legitimately has a row with an empty bin_iin
        // and must NOT be bootstrapped a second time. maybeSingle() so the
        // no-row case is null instead of an error.
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle()

        // Consume the stored postLoginRedirect exactly once, unconditionally,
        // regardless of which branch below ultimately fires -- otherwise a
        // stale key left behind by an untaken branch (e.g. onboarding or
        // hasPendingUpgrade() winning this time) could hijack a completely
        // unrelated later sign-in that never went through the guard that set
        // it. See src/lib/postLoginRedirect.ts.
        const postLoginRedirect = consumePostLoginRedirect()

        if (!profile) {
          // Brand-new account. /onboarding's step 1 used to do all of this
          // AND demand company name + BIN before any of it ran, which meant a
          // seller who came only for Kaspi Bot or the AI agent had to invent
          // invoice requisites to get past the door -- and, if they bounced,
          // never got their trial. The requisites question now lives at
          // /create, which already gates on it; everything else that step 1
          // did for EVERY user happens here instead.
          //
          // Order matters: the row must exist before /api/onboarding/grant
          // runs, because protect_profile_privileged_columns force-nulls
          // trial_expires_at on a non-service-role INSERT.
          await supabase.from('profiles').upsert({
            id: session.user.id,
            email: session.user.email,
          })

          const refCode = localStorage.getItem('referral_code') || ''
          if (refCode) {
            try {
              await fetch('/api/referral', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ userId: session.user.id, referralCode: refCode }),
              })
            } catch {}
            localStorage.removeItem('referral_code')
          }

          const promoCode = localStorage.getItem('promo_code') || ''
          const requestGrant = () => fetch('/api/onboarding/grant', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ promoCode: promoCode || undefined }),
          })
          // One retry, then give up quietly: unlike the old wizard there is no
          // form to hold the user on, and blocking the very first screen on a
          // flaky network would be worse than a missing trial the founder can
          // grant by hand. A failure is logged, not alerted.
          try {
            let grantRes = await requestGrant()
            if (!grantRes.ok) grantRes = await requestGrant()
            if (!grantRes.ok) console.error('signup: trial grant failed', grantRes.status)
            else if (promoCode) localStorage.removeItem('promo_code')
          } catch (e: any) {
            console.error('signup: trial grant threw', e?.message)
          }

          try {
            await fetch('/api/telegram', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                message: `🆕 <b>Новый пользователь!</b>\n📧 ${session.user.email}${refCode ? '\n🎁 Реферал: ' + refCode : ''}${promoCode ? '\n🏷 Промокод: ' + promoCode : ''}`,
              }),
            })
          } catch {}

          router.push('/dashboard')
        } else if (hasPendingUpgrade()) {
          // Already-onboarded account signing back in via magic link/Google/
          // Facebook -- safe to send straight to /upgrade when the landing
          // page's pricing CTA left one pending (see src/lib/pendingUpgrade.ts).
          // Checked before the generic postLoginRedirect below since it
          // carries a plan+period payload /upgrade's own mount effect still
          // needs to consume -- no regression from adding the generic path.
          router.replace('/upgrade')
        } else if (postLoginRedirect) {
          // Generic "return to the page that sent the user to /login" --
          // e.g. /kaspi-api/docs's auth guard (see
          // src/lib/postLoginRedirect.ts).
          router.replace(postLoginRedirect)
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
        <p className="text-gray-500">{t.loggingInMessage}</p>
      </div>
    </main>
  )
}