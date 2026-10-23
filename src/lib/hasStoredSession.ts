// Cheap, supabase-free guess at "might this browser hold a login?". Lets public
// pages skip downloading supabase-js for anonymous visitors. A false positive
// only costs one extra chunk load; a false negative is impossible for a real
// session, because supabase-js stores it under a fixed `sb-<ref>-auth-token`
// key (localStorage, or chunked `.0`/`.1` cookies when NEXT_PUBLIC_SHARED_SESSION
// is on -- see src/lib/supabase.ts).
const LS_KEY = /^sb-.+-auth-token/
const COOKIE_KEY = /(?:^|;\s*)sb-[^=;]*-auth-token/

export function mightHaveStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && LS_KEY.test(k)) return true
    }
  } catch {
    // blocked storage: fall through to cookies
  }
  try {
    return COOKIE_KEY.test(document.cookie)
  } catch {
    return false
  }
}
