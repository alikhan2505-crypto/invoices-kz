'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import ContentLoading from '@/components/ContentLoading'
import DesktopShell from '@/components/DesktopShell'
import ProGateCard from '@/components/ProGateCard'
import { kaspiProGateDict } from '@/lib/i18n/proGate'
import { kaspiShopGateState, type ProGateState } from '@/lib/proGate'
import { useCrossHref } from '@/lib/useCrossHref'
import { useEffectivePath } from '@/lib/useEffectivePath'

// Единая Про-стена Kaspi Bot (17.10.2026). Раньше каждая из 18 страниц раздела
// после загрузки меню и заставки молча делала router.push('/upgrade'). Теперь
// решение принимается один раз здесь, в layout: меню остаётся, а в рабочей зоне
// сразу честная карточка. Страницы Про-пользователя монтируются только после
// «allow», поэтому их запросы к API не уходят зря и 403 не сыплются в консоль.
// Свои проверки в страницах оставлены как запасные -- до них дело не дойдёт.
//
// Сбой чтения профиля или отсутствие сессии -- не повод закрывать раздел:
// пускаем, дальше каждая страница сама отправляет гостя на /login.
export default function KaspiShopGate({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage()
  const crossHref = useCrossHref()
  const path = useEffectivePath()
  const [state, setState] = useState<ProGateState | 'loading'>('loading')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { if (alive) setState('allow'); return }
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at')
          .eq('id', session.user.id)
          .single()
        if (!alive) return
        setState(error || !profile ? 'allow' : kaspiShopGateState(profile))
      } catch {
        if (alive) setState('allow')
      }
    })()
    return () => { alive = false }
  }, [])

  if (state === 'loading') return <ContentLoading />
  if (state === 'allow') return <>{children}</>

  const t = kaspiProGateDict[lang]
  const lapsed = state === 'lapsed'
  // Путь назад -- только раздел Kaspi Bot (isSafeBack в crossProduct).
  const back = path === '/kaspi-shop' || path.startsWith('/kaspi-shop/') ? path : '/kaspi-shop'
  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <ProGateCard
          title={lapsed ? t.lapsedTitle : t.title}
          text={lapsed ? t.lapsedText : t.text}
          cta={lapsed ? t.lapsedCta : t.cta}
          href={crossHref('invoices', '/upgrade', 'kaspiShop', back)}
        />
      </main>
    </DesktopShell>
  )
}
