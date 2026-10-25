'use client'
import { useCallback, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { BinLookupResult } from '@/lib/binLookup'

// Looking a company up by БИН, shared by the two forms that need it: the
// counterparty on /create and the user's own requisites on
// /profile/requisites. One copy, because the two must not drift into
// disagreeing about the same company.

export type BinLookupState = {
  status: 'idle' | 'loading' | 'found' | 'notfound'
  company?: BinLookupResult
}

type ExtraFields = Pick<BinLookupResult, 'unreliableCategories' | 'taxRegimes' | 'enforcement'>

/**
 * `extras: true` (only /create shows risks): after the name comes back, a second
 * request fetches the slow checks (tax regime, unreliable-list reasons, the
 * Ministry of Justice debtors register, up to ~9 s of retries) and merges them
 * into the same card. The first request, and so the name autofill, never waits
 * for them. The user's own requisites form leaves it off.
 */
export function useBinLookup({ extras = false }: { extras?: boolean } = {}) {
  const [state, setState] = useState<BinLookupState>({ status: 'idle' })
  // The БИН the last request was fired for. Typing the same twelve digits
  // again -- or pressing "Проверить" twice -- must not spend another of the
  // forty requests a minute the open-data portal allows.
  const lastRequested = useRef('')

  const reset = useCallback(() => {
    lastRequested.current = ''
    setState(current => (current.status === 'idle' ? current : { status: 'idle' }))
  }, [])

  /**
   * Look `bin` up. `force` re-asks even for a БИН already requested, which is
   * what the explicit button does: after a failure the user's next move is to
   * press it again, and refusing them because we remember trying would be
   * the app arguing with the person looking at the error.
   */
  const loadExtras = useCallback(async (digits: string, accessToken: string) => {
    try {
      const res = await fetch(`/api/bin-lookup?bin=${digits}&extras=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data?.found || !data.company) return
      const fields: ExtraFields = {
        unreliableCategories: data.company.unreliableCategories ?? null,
        taxRegimes: data.company.taxRegimes ?? null,
        enforcement: data.company.enforcement ?? null,
      }
      // The user may have moved on to another БИН while this was running.
      if (lastRequested.current !== digits) return
      setState(current =>
        current.status === 'found' && current.company?.bin === digits
          ? { status: 'found', company: { ...current.company, ...fields } }
          : current)
    } catch {
      // Not checked stays "not checked": the card simply shows no extra lines.
    }
  }, [])

  const lookup = useCallback(async (bin: string, { force = false }: { force?: boolean } = {}) => {
    const digits = (bin || '').replace(/\D/g, '')
    if (digits.length !== 12) return null
    if (!force && lastRequested.current === digits) return null
    lastRequested.current = digits
    setState({ status: 'loading' })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/bin-lookup?bin=${digits}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      })
      const data = await res.json()
      if (!res.ok || !data.found) {
        // A miss is ordinary: gbd_ul holds no sole proprietors and КГД may
        // be unreachable. Neither is the user's fault, so both land on the
        // same "type it in yourself" state rather than an error.
        setState({ status: 'notfound' })
        return null
      }
      setState({ status: 'found', company: data.company as BinLookupResult })
      if (extras) void loadExtras(digits, session?.access_token || '')
      return data.company as BinLookupResult
    } catch {
      setState({ status: 'notfound' })
      return null
    }
  }, [extras, loadExtras])

  return { binLookup: state, lookupBin: lookup, resetBinLookup: reset }
}
