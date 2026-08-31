// Generalizes the pending-upgrade mechanism (see src/lib/pendingUpgrade.ts)
// into a small "send the user back to where they actually wanted to go"
// helper. Concrete bug this fixes: the founder clicked the public
// /cashier-api page's «Документация API» link, /kaspi-api/docs's client-side
// auth guard bounced them to /login (no session), and after signing in they
// landed on /dashboard by default -- the intended destination was silently
// lost.
//
// Deliberately NOT a general "redirect to any URL after login" mechanism:
// only exact paths from ALLOWED_POST_LOGIN_REDIRECTS are ever honored, so
// nothing (a manipulated localStorage value, a bug elsewhere) can turn this
// into an open redirect. localStorage (not sessionStorage) by design --
// same reasoning as PENDING_UPGRADE_KEY -- it has to survive a full
// navigation to /login and, for the OAuth/magic-link paths, a second
// navigation through /auth/callback.
export const POST_LOGIN_REDIRECT_KEY = 'invoices.postLoginRedirect'

// Exact paths only -- never arbitrary URLs, never external hosts. Add a
// path here only when a real auth-gated page needs to preserve where the
// user was headed across a forced /login detour.
export const ALLOWED_POST_LOGIN_REDIRECTS = ['/kaspi-api/docs', '/kaspi-api', '/upgrade'] as const

export type PostLoginRedirectPath = typeof ALLOWED_POST_LOGIN_REDIRECTS[number]

function isAllowedPath(value: unknown): value is PostLoginRedirectPath {
  return typeof value === 'string' && (ALLOWED_POST_LOGIN_REDIRECTS as readonly string[]).includes(value)
}

export function setPostLoginRedirect(path: PostLoginRedirectPath) {
  try {
    localStorage.setItem(POST_LOGIN_REDIRECT_KEY, path)
  } catch {
    // Storage disabled/unavailable (private mode, quota, etc) or no `window`
    // (SSR). The auth guard still navigates to /login as before -- just
    // without a destination to return to afterwards. Never block navigation
    // on this.
  }
}

// Reads and clears the redirect in one step, exactly like
// consumePendingUpgrade() -- meant to be called exactly once, from /login's
// and /auth/callback's post-auth branches, so a stale entry can never be
// replayed on a later, unrelated sign-in. Re-validates against the
// allowlist on read too, not just on write, in case a stored value ever
// predates a narrower allowlist.
export function consumePostLoginRedirect(): PostLoginRedirectPath | null {
  try {
    const raw = localStorage.getItem(POST_LOGIN_REDIRECT_KEY)
    if (!raw) return null
    localStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
    return isAllowedPath(raw) ? raw : null
  } catch {
    return null
  }
}
