'use client'
import Link from 'next/link'
import { useLanguage } from '@/components/LanguageProvider'
import { lapsedNoticeDict } from '@/lib/i18n/proGate'
import { lapsedPaidPlan } from '@/lib/proGate'
import { parseDbTimestamp } from '@/lib/plan'
import { formatDateNumeric } from '@/lib/date'

// «Про истёк 01.10.2026 — Продлить». Показывается только тем, у кого платный
// план реально закончился (plan_expires_at в прошлом); профиль уже загружен
// страницей, новых запросов нет. Остальным -- ничего.
export default function LapsedPlanNotice({ profile, className = '' }: { profile: any; className?: string }) {
  const { lang } = useLanguage()
  const lapsed = lapsedPaidPlan(profile)
  const end = parseDbTimestamp(profile?.plan_expires_at)
  if (!lapsed || !end) return null
  const t = lapsedNoticeDict[lang]
  const date = formatDateNumeric(end.toISOString())
  return (
    <div role="status" className={`nav-glass flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 ${className}`}>
      <span className="text-sm min-w-0" style={{ color: 'var(--nav-text-secondary)' }}>{lapsed === 'pro' ? t.pro(date) : t.basic(date)}</span>
      <Link href="/upgrade" prefetch={false} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
        {t.cta}
      </Link>
    </div>
  )
}
