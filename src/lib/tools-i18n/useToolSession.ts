'use client'
import { useEffect, useState } from 'react'
import { mightHaveStoredSession } from '@/lib/hasStoredSession'
import { hasKaspiShopAccess, KASPI_SHOP_PROFILE_COLUMNS } from '@/lib/kaspiShop/access'

// Is the visitor of a free tool signed in (and, for the margin tool, do they
// have Kaspi Bot)? Starts as "anonymous" on the server AND on the first
// client render -- the tools are statically rendered for search engines, so
// anything else would be a hydration mismatch -- and switches after mount.
// Reads only the locally stored session (supabase.auth.getSession(), no
// network), and loads supabase-js at all only when this browser has a stored
// session -- anonymous visitors (nearly all search traffic) never download it.
// A stale token just means the cabinet page's own guard sends the
// person to /login, which now handles that.
export interface ToolSession {
  signedIn: boolean
  kaspiShopAccess: boolean
}

export function useToolSession({ withKaspiAccess = false }: { withKaspiAccess?: boolean } = {}): ToolSession {
  const [state, setState] = useState<ToolSession>({ signedIn: false, kaspiShopAccess: false })

  useEffect(() => {
    let cancelled = false
    if (!mightHaveStoredSession()) return
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled || !session) return
        if (!withKaspiAccess) { setState({ signedIn: true, kaspiShopAccess: false }); return }
        // The signed-in state is published only once access is known, so the
        // margin card never shows a Kaspi Bot link that is about to change
        // (an early click of a Pro user would have gone to the landing).
        // Own row only -- RLS allows it. Any failure means access=false, i.e.
        // the Kaspi Bot landing rather than a cabinet that would bounce them.
        let access = false
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select(KASPI_SHOP_PROFILE_COLUMNS)
            .eq('id', session.user.id)
            .maybeSingle()
          access = !error && !!data && hasKaspiShopAccess(data)
        } catch {
          access = false
        }
        if (!cancelled) setState({ signedIn: true, kaspiShopAccess: access })
      } catch {
        // stay anonymous
      }
    })()
    return () => { cancelled = true }
  }, [withKaspiAccess])

  return state
}
