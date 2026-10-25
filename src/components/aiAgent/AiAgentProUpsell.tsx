'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { aiAgentDict } from '@/lib/i18n/aiAgent'
import { aiAgentSetupDict } from '@/lib/i18n/aiAgentSetup'
import ProGateCard from '@/components/ProGateCard'
import PageHeader from '@/components/PageHeader'
import PageContainer from '@/components/PageContainer'
import { lapsedPaidPlan } from '@/lib/proGate'

// Что видит пользователь без активного Про на страницах AI-агента
// (15.10.2026). Раньше там было «Эта функция пока доступна только
// администраторам» -- неправда с 02.09, раздел открыт на Про, и тупик без
// пути дальше. Теперь честно: на каком тарифе и кнопка на /upgrade -- туда
// же ведут все остальные Про-стены приложения (Обзор, SiteNav proOnly).
// Только текст: кто пускается в раздел, решают те же проверки, что и раньше.
//
// 16.10.2026 (решение основателя 3): у кого Про КОНЧИЛСЯ, а агенты остались,
// -- «Продлите Про, чтобы агент снова отвечал» и ссылка на «Диалоги» только
// для чтения. Узнаём это у самого сервера: /api/ai-agent/dialogs отвечает
// readOnly: true ровно таким владельцам (и 403 всем остальным без Про).
//
// 25.10.2026: «Про был и кончился» узнаём и по профилю (lapsedPaidPlan, как у
// Kaspi Bot): раньше слова «Продлите» видел только владелец с агентами, а
// истёкший Про без агентов получал стену «Перейдите на Про», как будто он
// ничего не платил. Без агентов текст свой (lapsedNoAgentsText): про диалоги
// и ответы агента говорить нечего.
//
// 24.10.2026: `title` -- название раздела (то же, что у шапки самой страницы).
// С ним замок стоит под PageHeader в PageContainer: заголовок страницы не
// пропадает, а вкладка браузера называется разделом, а не общей строкой.
export default function AiAgentProUpsell({ title }: { title?: string }) {
  const { lang } = useLanguage()
  const t = aiAgentDict[lang]
  const s = aiAgentSetupDict[lang]
  const [lapsedOwner, setLapsedOwner] = useState(false)
  const [lapsedPro, setLapsedPro] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin, plan, plan_expires_at')
            .eq('id', session.user.id)
            .maybeSingle()
          if (alive && lapsedPaidPlan(profile) === 'pro') setLapsedPro(true)
        } catch { /* остаётся обычная Про-стена */ }
        const res = await fetch('/api/ai-agent/dialogs', { headers: { Authorization: `Bearer ${session.access_token}` } })
        if (!res.ok) return
        const data = await res.json()
        if (alive && data?.readOnly) setLapsedOwner(true)
      } catch { /* остаётся обычная Про-стена */ }
    })()
    return () => { alive = false }
  }, [])

  const card = (
    <ProGateCard
      title={lapsedOwner || lapsedPro ? s.lapsedTitle : t.proOnlyTitle}
      text={lapsedOwner ? s.lapsedText : lapsedPro ? s.lapsedNoAgentsText : t.proOnlyText}
      cta={lapsedOwner || lapsedPro ? s.lapsedCta : t.proOnlyCta}
      href="/upgrade"
      align={title ? 'start' : 'center'}
      extra={lapsedOwner ? (
        <div className="mt-3">
          <Link href="/ai-agent/dialogs" className="text-sm font-medium underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
            {s.lapsedDialogsLink}
          </Link>
        </div>
      ) : undefined}
    />
  )

  if (!title) return card
  return (
    <PageContainer variant="full" className="pb-6">
      <PageHeader title={title} subtitle="AI-агент" />
      {card}
    </PageContainer>
  )
}
