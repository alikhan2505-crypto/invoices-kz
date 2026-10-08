'use client'
import DesktopShell from '@/components/DesktopShell'
import SiteNav from '@/components/SiteNav'
import { formatTenge } from '@/lib/cfo/money'

export const inputClass = 'w-full min-h-[44px] rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'
export const inputStyle: React.CSSProperties = { background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)', WebkitTextFillColor: 'var(--nav-text-primary)' }

export function CfoPage({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <div className="cfo-page-content flex-1 min-w-0 p-4 lg:p-6 pb-6 space-y-5">
          <div className="flex items-center gap-3 flex-wrap justify-between">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>{title}</h1>
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
    </DesktopShell>
  )
}

export function Card({ children, className = '', dataTour }: { children: React.ReactNode; className?: string; dataTour?: string }) {
  return <div data-tour={dataTour} className={`nav-glass rounded-2xl p-4 lg:p-5 ${className}`}>{children}</div>
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{children}</h2>
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{label}</span>
      {children}
      {hint && <span className="text-xs mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>{hint}</span>}
    </label>
  )
}

export function PrimaryButton({ className = '', style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 ${className}`}
      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', ...style }}
    />
  )
}

export function GhostButton({ className = '', style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-[44px] rounded-xl px-4 text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)] disabled:opacity-60 ${className}`}
      style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-secondary)', ...style }}
    />
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl p-1 gap-1" style={{ background: 'var(--nav-surface-glass)' }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className="min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors"
          style={o.value === value
            ? { background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
            : { color: 'var(--nav-text-secondary)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Money({ value, signed = false, className = '' }: { value: number; signed?: boolean; className?: string }) {
  const text = signed && value > 0 ? `+${formatTenge(value)}` : formatTenge(value)
  return (
    <span className={`tabular-nums whitespace-nowrap ${className}`} style={{ color: value < 0 ? 'var(--nav-critical)' : undefined }}>
      {text}
    </span>
  )
}

const BADGE: Record<'plan' | 'fact' | 'warn' | 'muted', React.CSSProperties> = {
  plan: { background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' },
  fact: { background: 'var(--nav-success-soft)', color: 'var(--nav-success)' },
  warn: { background: 'var(--nav-magenta-soft)', color: 'var(--nav-critical)' },
  muted: { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' },
}

export function Badge({ tone, children }: { tone: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full" style={BADGE[tone]}>{children}</span>
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return <p role="alert" className="text-xs" style={{ color: 'var(--nav-critical)' }}>{children}</p>
}

export function EmptyState({ title, hint, href, cta }: { title: string; hint: string; href?: string; cta?: string }) {
  return (
    <Card className="text-center py-10">
      <div className="text-base font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{title}</div>
      <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: 'var(--nav-text-secondary)' }}>{hint}</p>
      {href && cta && (
        <a href={href} className="inline-flex items-center min-h-[44px] mt-4 rounded-xl px-4 text-sm font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {cta}
        </a>
      )}
    </Card>
  )
}

export function YearPicker({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1">
      <GhostButton type="button" onClick={() => onChange(value - 1)} aria-label="Предыдущий год">‹</GhostButton>
      <span className="text-sm font-semibold tabular-nums px-2" style={{ color: 'var(--nav-text-primary)' }}>{value}</span>
      <GhostButton type="button" onClick={() => onChange(value + 1)} aria-label="Следующий год">›</GhostButton>
    </div>
  )
}
