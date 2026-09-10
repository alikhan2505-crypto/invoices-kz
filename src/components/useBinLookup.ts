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

export function useBinLookup() {
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
      return data.company as BinLookupResult
    } catch {
      setState({ status: 'notfound' })
      return null
    }
  }, [])

  return { binLookup: state, lookupBin: lookup, resetBinLookup: reset }
}
