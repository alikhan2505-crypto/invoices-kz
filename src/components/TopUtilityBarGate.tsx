'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useEffectivePath } from '@/lib/useEffectivePath'
import { isUtilityBarHiddenPath } from '@/lib/utilityBarPaths'

// The bar is ~400 KB of JS (supabase, framer-motion, qrcode) and renders nothing
// on public pages and for signed-out visitors, so it is fetched only on pages
// where it can actually show. ssr:false: the server never rendered it anyway
// (it starts logged-out, i.e. null), so the HTML does not change.
// A failed chunk fetch (flaky network, deploy skew in a long-lived tab) must not
// take the whole page down: the bar is decorative relative to the page content.
const TopUtilityBar = dynamic(
  () => import('./TopUtilityBar').catch(() => ({ default: () => null })),
  { ssr: false },
)

// Same keys/param the bar's init() uses for the welcome-bonus link. That link
// can land on a public page (a plain "/?claimBonus=1" from a mass email) and the
// bar must still run once there to stash the intent across the login detour.
const PENDING_BONUS_KEY = 'invoices.pendingWelcomeBonus'

const noopSubscribe = () => () => {}
function hasClaimIntent(): boolean {
  try {
    return (
      new URLSearchParams(window.location.search).get('claimBonus') === '1' ||
      localStorage.getItem(PENDING_BONUS_KEY) === '1'
    )
  } catch {
    return false
  }
}

export default function TopUtilityBarGate() {
  const pathname = useEffectivePath()
  const claimIntent = useSyncExternalStore(noopSubscribe, hasClaimIntent, () => false)
  // The cheap, supabase-free half of the welcome-bonus intent runs synchronously
  // at hydration, NOT inside the lazy bar chunk: the page's own auth guard (e.g.
  // /dashboard -> router.push('/login')) fires after an async getUser(), and a
  // late history.replaceState from a lazily loaded bar would cancel that push and
  // strand a guest on the cabinet. The bar's init() then finds the flag in
  // localStorage and claims as before.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('claimBonus') === '1') {
        window.history.replaceState(null, '', window.location.pathname)
        localStorage.setItem(PENDING_BONUS_KEY, '1')
      }
    } catch {}
  }, [])
  // Once the bar has been wanted it stays mounted for the rest of the session,
  // exactly like the always-mounted bar it replaces (no re-init, no re-fetch of
  // the balance when someone wanders cabinet -> public page -> cabinet).
  const [activated, setActivated] = useState(false)
  const wanted = !isUtilityBarHiddenPath(pathname) || claimIntent
  if (wanted && !activated) setActivated(true)
  if (!wanted && !activated) return null
  return <TopUtilityBar />
}
