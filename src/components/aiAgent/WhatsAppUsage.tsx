'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { aiAgentSetupDict } from '@/lib/i18n/aiAgentSetup'
import { waUsageFraction, type WaUsageLevel } from '@/lib/aiAgent/waUsage'

// Строка счётчика бесплатных ответов WhatsApp (16.10.2026): карточка
// WhatsApp на «Каналах» и шаг «Запуск» мастера. Данные --
// GET /api/ai-agent/whatsapp/usage?agentId=. Цвета: < 80% обычный,
// 80–99% жёлтый, ≥ 100% красный + строка про оплату Meta. Ответы агента
// счётчик никогда не блокирует -- он только предупреждает.

export type WaUsageNumber = { agentId: string; agentName: string; phone: string | null; used: number; level: WaUsageLevel }
export type WaUsageResponse = { limit: number; monthStart: string; resetsAt: string; approximate: boolean; numbers: WaUsageNumber[] }

// --nav-warning появился в globals.css вместе с этим счётчиком: если edge
// отдаст старый закешированный чанк стилей (ловушка immutable-CSS), токена не
// будет -- поэтому запасной цвет прямо в var().
export const NAV_WARNING = 'var(--nav-warning, #B45309)'

export function waLevelColor(level: WaUsageLevel): string {
  return level === 'over' ? 'var(--nav-critical)' : level === 'warn' ? NAV_WARNING : 'var(--nav-accent)'
}

export async function fetchWaUsage(agentId?: string): Promise<WaUsageResponse | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/ai-agent/whatsapp/usage${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data?.numbers) ? data as WaUsageResponse : null
  } catch {
    return null
  }
}

// `refreshKey` -- поменять, чтобы перечитать (например, после подключения).
export default function WhatsAppUsage({ agentId, refreshKey = 0 }: { agentId: string; refreshKey?: number }) {
  const { lang } = useLanguage()
  const s = aiAgentSetupDict[lang]
  const [data, setData] = useState<WaUsageResponse | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    fetchWaUsage(agentId).then(d => { if (alive) setData(d) })
    return () => { alive = false }
  }, [agentId, refreshKey])

  if (data === undefined) return null
  if (data === null) {
    return <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>{s.waUnavailable}</div>
  }
  const row = data.numbers.find(n => n.agentId === agentId)
  if (!row) return null
  const color = waLevelColor(row.level)
  const pct = Math.round(waUsageFraction(row.used, data.limit) * 100)

  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-2 text-[11px] mb-1">
        <span className="font-medium" style={{ color: row.level === 'normal' ? 'var(--nav-text-secondary)' : color }}>
          {s.waUsageLine(row.used, data.limit)}
        </span>
        <span className="flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>{s.waResets}</span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--nav-bg)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={data.limit}
        aria-valuenow={Math.min(row.used, data.limit)}
        aria-label={s.waTitle}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      {/* Счёт по агенту, а не по номеру: у диалога нет connection_id (A3). */}
      <div className="text-[10.5px] mt-1" style={{ color: 'var(--nav-text-muted)' }} title={s.waApproxHint}>{s.waApprox}</div>
      {row.level === 'over' && (
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--nav-critical)' }}>{s.waOver}</p>
      )}
    </div>
  )
}
