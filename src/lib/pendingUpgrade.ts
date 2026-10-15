import type { BillingPeriod } from '@/lib/plans/pricing'
import { isFreshIntent, parseIntentJson } from './storedIntent'

// Bridges the landing page's Basic/Pro "Подключить" CTA (period + plan
// choice) through /login -> passkey/magic-link/Google/Facebook -> back to
// /upgrade, which otherwise always defaults `period` to 'monthly' and loses
// which card the visitor picked. localStorage (not sessionStorage) by
// design -- it has to survive a full navigation to /login and, for the
// OAuth/magic-link paths, a second navigation through /auth/callback,
// exactly like the existing `referral_code` key already does (see
// src/app/login/page.tsx and src/app/auth/callback/page.tsx).
//
// Stored as JSON { plan, period, at } and honored only for
// STORED_INTENT_TTL_MS (30 minutes) -- see src/lib/storedIntent.ts. A legacy
// entry without `at` is treated as stale.
export const PENDING_UPGRADE_KEY = 'invoices.pendingUpgrade'

export interface PendingUpgrade {
  plan: 'basic' | 'pro'
  period: BillingPeriod
}

// The landing page's Basic/Pro CTA can now be served from docs.invoices.kz
// (see hostRouting.ts) and always sends the visitor to the apex /login --
// a different origin, where localStorage set on docs. isn't readable. The
// plan/period travel in the URL instead (?plan=&period=), read here on
// /login's own origin and turned into the same localStorage entry
// consumePendingUpgrade() already expects. Same validate-on-read shape as
// postLoginRedirectFromSearch.
export function pendingUpgradeFromSearch(search: string): PendingUpgrade | null {
  const params = new URLSearchParams(search)
  const plan = params.get('plan')
  const period = params.get('period')
  if ((plan === 'basic' || plan === 'pro') && (period === 'monthly' || period === 'annual')) {
    return { plan, period }
  }
  return null
}

// The one place that decides whether a stored entry still counts: valid
// plan+period AND saved within the last 30 minutes.
function freshPendingUpgrade(raw: string | null, now: number): PendingUpgrade | null {
  const entry = parseIntentJson(raw)
  if (!entry || !isFreshIntent(entry.at, now)) return null
  const { plan, period } = entry
  if ((plan === 'basic' || plan === 'pro') && (period === 'monthly' || period === 'annual')) {
    return { plan, period }
  }
  return null
}

export function setPendingUpgrade(plan: PendingUpgrade['plan'], period: BillingPeriod, now: number = Date.now()) {
  try {
    localStorage.setItem(PENDING_UPGRADE_KEY, JSON.stringify({ plan, period, at: now }))
  } catch {
    // Storage disabled/unavailable (private mode, quota, etc). The CTA
    // still navigates to /login as before -- just without the period/plan
    // carried through. Never block navigation on this.
  }
}

// Non-destructive peek, for the post-login redirect decision (login page /
// auth callback): they only need to know whether to send the user to
// /upgrade instead of /dashboard, not the payload itself -- /upgrade's own
// mount effect is what actually consumes it. A stale/legacy/garbage entry
// is removed on the spot (so it can't hijack a later sign-in either) and
// reads as "nothing pending".
export function hasPendingUpgrade(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(PENDING_UPGRADE_KEY)
    if (!raw) return false
    if (freshPendingUpgrade(raw, now)) return true
    localStorage.removeItem(PENDING_UPGRADE_KEY)
    return false
  } catch {
    return false
  }
}

// Reads and clears the pending upgrade in one step. Meant to be called
// exactly once, from /upgrade's mount effect, so a stale entry can never be
// replayed on a later, unrelated visit to the page.
export function consumePendingUpgrade(now: number = Date.now()): PendingUpgrade | null {
  try {
    const raw = localStorage.getItem(PENDING_UPGRADE_KEY)
    if (!raw) return null
    localStorage.removeItem(PENDING_UPGRADE_KEY)
    return freshPendingUpgrade(raw, now)
  } catch {
    return null
  }
}
