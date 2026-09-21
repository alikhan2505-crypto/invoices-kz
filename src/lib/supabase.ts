import { createClient } from '@supabase/supabase-js'
import { createSharedSessionStorage, sharedCookieDomain } from './sharedSessionStorage'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Stage 2 of the product split: share the login across *.invoices.kz through a
// cookie. OFF unless NEXT_PUBLIC_SHARED_SESSION=1 (inlined at build time, so
// changing it needs a redeploy) -- with it off this file behaves exactly as it
// always did. Browser only: on the server there is no window, so the default
// storage applies. Rollback = unset the variable and redeploy.
function sharedStorage() {
  if (process.env.NEXT_PUBLIC_SHARED_SESSION !== '1') return undefined
  if (typeof window === 'undefined') return undefined
  let local: Storage | null = null
  try {
    local = window.localStorage
  } catch {
    // Blocked storage: the cookie alone still works.
  }
  return createSharedSessionStorage({
    jar: { get: () => document.cookie, set: (cookie) => { document.cookie = cookie } },
    local,
    domain: sharedCookieDomain(window.location.hostname),
    secure: window.location.protocol === 'https:',
  })
}

const storage = sharedStorage()

export const supabase = createClient(supabaseUrl, supabaseKey, storage ? { auth: { storage } } : undefined)
