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
export function choosePostLoginDestination(intents: PostLoginIntents, enabledProducts: unknown): string {
  if (intents.hasPendingUpgrade) return '/upgrade'
  if (intents.postLoginRedirect) return intents.postLoginRedirect
  return homeFor(enabledProducts)
}

// Reads the stored intents. Consumes postLoginRedirect exactly once,
// unconditionally -- even when the pending upgrade wins this time -- so a
// leftover key can never hijack a later, unrelated sign-in. The pending
// upgrade is only peeked at (/upgrade consumes it).
export function readPostLoginIntents(): PostLoginIntents {
  const postLoginRedirect = consumePostLoginRedirect()
  return { hasPendingUpgrade: hasPendingUpgrade(), postLoginRedirect }
}

// Convenience for callers that don't have the profile yet: enabled_products
// is only fetched when neither intent applies. A failed fetch falls back to
// homeFor(undefined) = /dashboard.
export async function resolvePostLoginDestination(loadEnabledProducts: () => Promise<unknown>): Promise<string> {
  const intents = readPostLoginIntents()
  if (intents.hasPendingUpgrade || intents.postLoginRedirect) return choosePostLoginDestination(intents, null)
  let enabledProducts: unknown = null
  try {
    enabledProducts = await loadEnabledProducts()
  } catch {
    enabledProducts = null
  }
  return choosePostLoginDestination(intents, enabledProducts)
}
