'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { aiAgentDict } from '@/lib/i18n/aiAgent'
import { aiAgentSetupDict } from '@/lib/i18n/aiAgentSetup'
import ProGateCard from '@/components/ProGateCard'

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
export default function AiAgentProUpsell() {
  const { lang } = useLanguage()
  const t = aiAgentDict[lang]
  const s = aiAgentSetupDict[lang]
  const [lapsedOwner, setLapsedOwner] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/ai-agent/dialogs', { headers: { Authorization: `Bearer ${session.access_token}` } })
        if (!res.ok) return
        const data = await res.json()
        if (alive && data?.readOnly) setLapsedOwner(true)
      } catch { /* остаётся обычная Про-стена */ }
    })()
    return () => { alive = false }
  }, [])

  return (
    <ProGateCard
      title={lapsedOwner ? s.lapsedTitle : t.proOnlyTitle}
      text={lapsedOwner ? s.lapsedText : t.proOnlyText}
      cta={lapsedOwner ? s.lapsedCta : t.proOnlyCta}
      href="/upgrade"
      extra={lapsedOwner ? (
        <div className="mt-3">
          <Link href="/ai-agent/dialogs" className="text-sm font-medium underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
            {s.lapsedDialogsLink}
          </Link>
        </div>
      ) : undefined}
    />
  )
}
