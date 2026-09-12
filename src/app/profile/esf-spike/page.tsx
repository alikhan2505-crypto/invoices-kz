// Server wrapper only -- `dynamic` route-segment config has no effect when
// exported from a 'use client' file, so the actual page (which imports
// signDocument.ts, whose browser-only deps crash Next's static-prerender
// worker with "self is not defined") lives in EsfSpikeClient.tsx instead.
export const dynamic = 'force-dynamic'

import EsfSpikeClient from './EsfSpikeClient'

export default function EsfSpikePage() {
  return <EsfSpikeClient />
}
