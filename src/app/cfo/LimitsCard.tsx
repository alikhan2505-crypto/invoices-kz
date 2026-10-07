'use client'
import { monthLimits } from '@/lib/cfo/limits'
import { monthTitle } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import { useCfo } from './CfoWorkspace'
import { Card, SectionTitle } from './ui'

const COLOR = { ok: 'var(--nav-accent)', warn: 'var(--nav-magenta)', over: 'var(--nav-critical)' } as const

// Лимиты расходов месяца — это план по статьям из «Плана»: видно, где бюджет на исходе.
export default function LimitsCard({ month }: { month: string }) {
  const { ws } = useCfo()
  const rows = monthLimits(ws, month)
  return (
    <Card>
      <SectionTitle>Лимиты расходов · {monthTitle(month)}</SectionTitle>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
          Лимитов нет. Впишите план расходов по статьям в{' '}
          <a href="/cfo/plan" className="inline-flex items-center min-h-[44px] underline font-semibold" style={{ color: 'var(--nav-accent)' }}>Плане</a>
          {' '}— здесь будет видно, где бюджет на исходе.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.articleId}>
              <div className="flex justify-between gap-2 text-sm flex-wrap">
                <span style={{ color: 'var(--nav-text-primary)' }}>{r.name}</span>
                <span className="tabular-nums" style={{ color: r.level === 'ok' ? 'var(--nav-text-secondary)' : COLOR[r.level] }}>
                  {formatTenge(r.fact)} из {formatTenge(r.plan)} · {Math.round(r.share * 100)}%{r.level === 'over' ? ' — превышен' : r.level === 'warn' ? ' — почти исчерпан' : ''}
                </span>
              </div>
              <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--nav-surface-glass)' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, r.share * 100)}%`, background: COLOR[r.level] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
