// Meta Conversions API, scoped to one seller's own Pixel -- fires when a
// WhatsApp conversation's first message carries Meta's ctwa_clid (meaning
// it started from a Click-to-WhatsApp ad), so the seller's own ad account
// learns a real lead came out of that click. Verified against Meta's
// current documented schema for action_source=business_messaging
// (05.10.2026) -- event_name is "Lead" (the standard Meta event), NOT
// "LeadSubmitted" (that name is reserved for Meta's own automatic
// lead-gen-flow events inside WhatsApp Flows, a different product).
//
// v1 deliberately sends only ctwa_clid in user_data -- no hashed phone/
// email, no custom_data -- ctwa_clid alone is the real attribution key for
// a CTWA conversion; anything else would add complexity with no MVP payoff.

export class MetaCapiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'MetaCapiError'
  }
}

export function buildLeadEventPayload(ctwaClid: string, eventTimeUnix: number): object {
  return {
    data: [{
      event_name: 'Lead',
      event_time: eventTimeUnix,
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      user_data: { ctwa_clid: ctwaClid },
    }],
  }
}

const GRAPH_API = 'https://graph.facebook.com/v21.0'

// access_token goes in the POST body, same convention every other Graph
// API call in this codebase already uses (see src/lib/instagram.ts's
// createContainer) -- not an Authorization header.
export async function sendLeadEvent(pixelId: string, accessToken: string, ctwaClid: string): Promise<void> {
  const payload = buildLeadEventPayload(ctwaClid, Math.floor(Date.now() / 1000))
  const res = await fetch(`${GRAPH_API}/${pixelId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, access_token: accessToken }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new MetaCapiError(data?.error?.message || 'Failed to send Meta CAPI Lead event', res.status)
  }
}
