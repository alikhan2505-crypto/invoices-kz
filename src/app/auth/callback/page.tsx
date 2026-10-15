'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { authDict } from '@/lib/i18n/auth'
import { choosePostLoginDestination, readPostLoginIntents } from '@/lib/postLoginDestination'
import { selectablePersonaProducts, parsePersonaKeys, PENDING_PERSONA_KEY } from '@/lib/products'
import { logToolEvent, readFirstTouch } from '@/lib/tools-i18n/toolEvents'

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

        // The profiles row is NOT created here -- an AFTER INSERT trigger on
        // auth.users (on_auth_user_created -> handle_new_user) creates it
        // inside the signup transaction, so it always exists by the time this
        // code runs. Asking "does a row exist" therefore never fires. What we
        // actually need to know is whether this account has ever been through
        // the one-time bootstrap below, which these three columns record.
        const { data: profile } = await supabase
          .from('profiles')
          .select('trial_expires_at, promo_granted_at, referred_by, enabled_products, is_admin, tour_completed_at')
          .eq('id', session.user.id)
          .maybeSingle()

        // Consume the stored postLoginRedirect exactly once, unconditionally,
        // regardless of which branch below ultimately fires -- otherwise a
        // stale key left behind by an untaken branch (e.g. onboarding or
        // hasPendingUpgrade() winning this time) could hijack a completely
        // unrelated later sign-in that never went through the guard that set
        // it. See src/lib/postLoginRedirect.ts. readPostLoginIntents() does
        // that consume and also peeks at a (fresh) pending upgrade; stale
        // entries -- older than 30 minutes -- are dropped there (see
        // src/lib/storedIntent.ts).
        const intents = readPostLoginIntents()

        // Start-page answer ("what do you do?") given before signing in: it
        // connects the matching products, but only for an account that has not
        // chosen yet -- it never overwrites an existing account's list.
        let enabledProducts: unknown = profile?.enabled_products
        try {
          // Several answers may have been picked: their products add up;
          // locked / admin-only ones are left out of a fresh account's menu.
          const persona = selectablePersonaProducts(parsePersonaKeys(localStorage.getItem(PENDING_PERSONA_KEY)), !!profile?.is_admin)
          localStorage.removeItem(PENDING_PERSONA_KEY)
          if (persona && !Array.isArray(enabledProducts)) {
            await supabase.from('profiles').update({ enabled_products: persona }).eq('id', session.user.id)
            enabledProducts = persona
          }
        } catch {
          // Storage blocked: the account simply stays unchosen (shows everything).
        }

        // Exactly one place decides where a fully-authenticated user lands --
        // used below by an already-bootstrapped account, and by the
        // bootstrap chain itself (both its success path and its early return
        // on a failed profile upsert), so the highest-intent user in the
        // funnel (landing page's "Подключить Pro" -> setPendingUpgrade() ->
        // /login) still reaches /upgrade no matter which of those ran.
        // Priority (fresh pending upgrade -> fresh postLoginRedirect ->
        // homeFor) lives in src/lib/postLoginDestination.ts, shared with
        // /login. replace, not push: /login and this page should not stay in
        // history behind the destination.
        const goToDestination = () => {
          // Newcomer (tour not done; no profile row = brand new too) -> dashboard tour first.
          router.replace(choosePostLoginDestination(intents, enabledProducts, profile ? !!profile.tour_completed_at : false))
        }

        const needsBootstrap =
          !profile || (!profile.trial_expires_at && !profile.promo_granted_at && !profile.referred_by)

        if (needsBootstrap) {
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
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: session.user.id,
            email: session.user.email,
          })
          if (profileError) {
            // Everything below needs this row to exist: /api/onboarding/grant writes
            // trial_expires_at with .update(), which PostgREST reports as a success
            // even when it matches zero rows -- so continuing here would hand the user
            // a dashboard and a 200 response for a trial that was never granted.
            console.error('signup bootstrap: profile row not created', profileError.message)
            goToDestination()
            return
          }

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
          })
          // One retry, then give up quietly: unlike the old wizard there is no
          // form to hold the user on, and blocking the very first screen on a
          // flaky network would be worse than a missing trial the founder can
          // grant by hand. A failure is logged, not alerted.
          //
          // Retries both failure shapes: a rejected fetch (the actual "flaky
          // network" case -- fetch() throwing used to skip the `!grantRes.ok`
          // check entirely and land straight in the outer catch with zero
          // retries, so the one case this comment was written for got none)
          // and a resolved-but-non-ok response.
          try {
            const attemptGrant = async (): Promise<Response | null> => {
              try {
                return await requestGrant()
              } catch (e: any) {
                console.error('signup: trial grant threw', e?.message)
                return null
              }
            }
            let grantRes = await attemptGrant()
            if (!grantRes || !grantRes.ok) grantRes = await attemptGrant()
            if (!grantRes || !grantRes.ok) console.error('signup: trial grant failed', grantRes?.status)
          } catch (e: any) {
            console.error('signup: trial grant threw', e?.message)
          }

          // A promo code carried in from /promo/[code] is redeemed through the
          // very same route /upgrade uses, so it grants the plan it was created
          // with, for the days it was created with -- and goes through the same
          // max_uses gate and once-per-account claim. It used to be handled
          // inside the trial grant above as a separate "signup bonus", which
          // meant one code quietly did two different things depending on where
          // it was entered.
          //
          // The code is dropped from storage whatever the outcome: a bad or
          // spent code is not worth silently retrying on every later sign-in,
          // and /upgrade's own field is there for a second attempt.
          if (promoCode) {
            try {
              const promoRes = await fetch('/api/plan/promo', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ code: promoCode.toUpperCase() }),
              })
              if (!promoRes.ok) console.error('signup: promo redeem failed', promoRes.status)
            } catch (e: any) {
              console.error('signup: promo redeem threw', e?.message)
            }
            localStorage.removeItem('promo_code')
          }

          try {
            await fetch('/api/telegram', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                event: 'signup',
                email: session.user.email,
                refCode: refCode || undefined,
                promoCode: promoCode || undefined,
              }),
            })
          } catch {}

          // Своя аналитика бесплатных инструментов: регистрация засчитывается
          // инструменту первого касания этого браузера (младше 30 дней), иначе
          // tool='none'. Выстрелил и забыл (fetch keepalive с токеном — сервер
          // берёт из него user_id): переход ниже не ждёт и не может сломаться.
          const firstTouch = readFirstTouch()
          logToolEvent('signup', firstTouch?.tool ?? 'none', {
            accessToken: session.access_token,
            utm: { source: firstTouch?.utm_source, medium: firstTouch?.utm_medium, campaign: firstTouch?.utm_campaign },
          })

          goToDestination()
        } else {
          goToDestination()
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