import type { BillingPeriod } from '@/lib/plans/pricing'

// Bridges the landing page's Basic/Pro "Подключить" CTA (period + plan
// choice) through /login -> passkey/magic-link/Google/Facebook -> back to
// /upgrade, which otherwise always defaults `period` to 'monthly' and loses
// which card the visitor picked. localStorage (not sessionStorage) by
// design -- it has to survive a full navigation to /login and, for the
// OAuth/magic-link paths, a second navigation through /auth/callback,
// exactly like the existing `referral_code` key already does (see
// src/app/login/page.tsx and src/app/auth/callback/page.tsx).
export const PENDING_UPGRADE_KEY = 'invoices.pendingUpgrade'

export interface PendingUpgrade {
  plan: 'basic' | 'pro'
  period: BillingPeriod
}

export function setPendingUpgrade(plan: PendingUpgrade['plan'], period: BillingPeriod) {
  try {
    localStorage.setItem(PENDING_UPGRADE_KEY, JSON.stringify({ plan, period }))
  } catch {
    // Storage disabled/unavailable (private mode, quota, etc). The CTA
    // still navigates to /login as before -- just without the period/plan
    // carried through. Never block navigation on this.
  }
}

// Non-destructive peek, for the post-login redirect decision (login page /
// auth callback): they only need to know whether to send the user to
// /upgrade instead of /dashboard, not the payload itself -- /upgrade's own
// mount effect is what actually consumes it.
export function hasPendingUpgrade(): boolean {
  try {
    return !!localStorage.getItem(PENDING_UPGRADE_KEY)
  } catch {
    return false
  }
}

// Reads and clears the pending upgrade in one step. Meant to be called
// exactly once, from /upgrade's mount effect, so a stale entry can never be
// replayed on a later, unrelated visit to the page.
export function consumePendingUpgrade(): PendingUpgrade | null {
  try {
    const raw = localStorage.getItem(PENDING_UPGRADE_KEY)
    if (!raw) return null
    localStorage.removeItem(PENDING_UPGRADE_KEY)
    const parsed = JSON.parse(raw)
    if (
      (parsed?.plan === 'basic' || parsed?.plan === 'pro') &&
      (parsed?.period === 'monthly' || parsed?.period === 'annual')
    ) {
      return { plan: parsed.plan, period: parsed.period }
    }
    return null
  } catch {
    return null
  }
}
