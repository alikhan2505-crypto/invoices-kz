import { supabase } from '@/lib/supabase'

// «Выйти», shared by the app chrome and /profile.
//
// supabase.auth.signOut() keeps the local session when the /logout call fails
// with anything but 401/403/404 (a 5xx, a dropped connection) -- and since
// 15.10.2026 /login sends a visitor with a valid session straight back into
// the cabinet, so a failed sign-out would look like «Выйти» does nothing.
// Retry with the local scope; if even that fails, /login?signedOut=1 tells
// the page to show the form instead of redirecting.
export const SIGNED_OUT_PARAM = 'signedOut'

export async function signOutForLogin(): Promise<string> {
  try {
    const { error } = await supabase.auth.signOut()
    if (!error) return '/login'
    const { error: localError } = await supabase.auth.signOut({ scope: 'local' })
    if (!localError) return '/login'
  } catch {
    // fall through
  }
  return `/login?${SIGNED_OUT_PARAM}=1`
}
