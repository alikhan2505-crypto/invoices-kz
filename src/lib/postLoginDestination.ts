import { hasPendingUpgrade } from './pendingUpgrade'
import { consumePostLoginRedirect, type PostLoginRedirectPath } from './postLoginRedirect'
import { homeFor } from './products'

// The one rule for where an authenticated user goes after /login -- shared by
// /login (passkey sign-in, and an already-signed-in visitor who lands on
// /login) and /auth/callback (magic link / OAuth), so the three can't drift
// apart again. Priority, unchanged from what both pages did inline:
//   1. a fresh pending upgrade (landing pricing card) -> /upgrade, whose own
//      mount effect consumes the plan+period payload;
//   2. a fresh postLoginRedirect (the page that sent the user to /login);
//   3. the user's home for their chosen products (homeFor).
// "Fresh" = saved within the last 30 minutes (src/lib/storedIntent.ts); stale
// entries are dropped by the readers themselves.

export interface PostLoginIntents {
  hasPendingUpgrade: boolean
  postLoginRedirect: PostLoginRedirectPath | null
}

// Pure, unit-tested. Never returns /login (nothing in the allowlist or in
// homeFor() is /login), so a caller on /login can't loop.
//
// tourDone === false (profiles.tour_completed_at is null — a newcomer, решение
// основателя 15.10.2026 «полную экскурсию»): first the dashboard with its
// tour, even if a product landing (/login?next=/kaspi-shop/overview) or the
// start-page persona would send them into a product they may not have yet
// (Kaspi Bot without Pro bounced newcomers to /upgrade, past the tour). An
// explicit wish to pay still wins: a pending upgrade or next=/upgrade.
// tourDone undefined (unknown) changes nothing.
export function choosePostLoginDestination(intents: PostLoginIntents, enabledProducts: unknown, tourDone?: boolean): string {
  if (intents.hasPendingUpgrade) return '/upgrade'
  if (intents.postLoginRedirect === '/upgrade') return '/upgrade'
  if (tourDone === false) return '/dashboard'
  if (intents.postLoginRedirect) return intents.postLoginRedirect
  return homeFor(enabledProducts)
}

export interface OwnProfileForDestination {
  enabled_products?: unknown
  tour_completed_at?: string | null
}

// Reads the stored intents. Consumes postLoginRedirect exactly once,
// unconditionally -- even when the pending upgrade wins this time -- so a
// leftover key can never hijack a later, unrelated sign-in. The pending
// upgrade is only peeked at (/upgrade consumes it).
export function readPostLoginIntents(): PostLoginIntents {
  const postLoginRedirect = consumePostLoginRedirect()
  return { hasPendingUpgrade: hasPendingUpgrade(), postLoginRedirect }
}

// Convenience for callers that don't have the profile yet: the own profile
// (enabled_products, tour_completed_at) is fetched unless a purchase intent
// decides. A failed fetch falls back to the intent / homeFor(undefined).
export async function resolvePostLoginDestination(loadOwnProfile: () => Promise<OwnProfileForDestination | null>): Promise<string> {
  const intents = readPostLoginIntents()
  if (intents.hasPendingUpgrade || intents.postLoginRedirect === '/upgrade') return choosePostLoginDestination(intents, null)
  let profile: OwnProfileForDestination | null = null
  try {
    profile = await loadOwnProfile()
  } catch {
    profile = null
  }
  // No profile (load failed) -> tour state unknown -> previous behaviour.
  const tourDone = profile ? !!profile.tour_completed_at : undefined
  return choosePostLoginDestination(intents, profile?.enabled_products ?? null, tourDone)
}
