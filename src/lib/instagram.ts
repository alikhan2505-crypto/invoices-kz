import type { FlowStep } from './aiAgent/flow'
import { loadPublishToken } from './instagramPublishToken'

// "Instagram API with Instagram Login" tokens (prefixed IGAA...) are only
// valid against graph.instagram.com — the classic graph.facebook.com host
// (used by the older Facebook-Login flavor of this API) can't parse them
// at all, which surfaces as an opaque "Cannot parse access token" error.
const GRAPH_API = 'https://graph.instagram.com/v21.0'

async function createContainer(igUserId: string, accessToken: string, params: Record<string, string>): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, access_token: accessToken }),
  })
  const data = await res.json()
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || 'Failed to create media container')
  }
  return data.id as string
}

// Instagram processes each container asynchronously — publishing (or adding
// it as a carousel child) before it reports FINISHED fails with an opaque
// "Media ID is not available".
async function waitUntilFinished(containerId: string, accessToken: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const statusRes = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code&access_token=${accessToken}`
    )
    const statusData = await statusRes.json()
    if (statusData.status_code === 'FINISHED') return
    if (statusData.status_code === 'ERROR') {
      throw new Error('Instagram failed to process the media container')
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
}

// The account we publish to, resolved from the token itself when
// INSTAGRAM_BUSINESS_ACCOUNT_ID is not set.
//
// That variable does double duty: publishing used to read it, and the webhook
// still compares it against entry.id to decide whether an event belongs to the
// retired single-tenant auto-reply path. Unsetting it in Vercel to kill that
// path therefore also killed posting — a draft the founder approved on
// 2026-09-07 failed with "Instagram not configured" even though the token was
// fine. Deriving the id from the token decouples the two: posting needs only
// INSTAGRAM_ACCESS_TOKEN, and the legacy branch stays off.
let cachedIgUserId: string | null = null

async function resolveIgUserId(accessToken: string): Promise<string> {
  const configured = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  if (configured) return configured
  if (cachedIgUserId) return cachedIgUserId
  const res = await fetch(`${GRAPH_API}/me?fields=user_id&access_token=${accessToken}`)
  const data = await res.json()
  const id = data?.user_id ? String(data.user_id) : ''
  if (!res.ok || !id) {
    throw new Error(data?.error?.message || 'Could not resolve the Instagram account from the access token')
  }
  cachedIgUserId = id
  return id
}

// A single image publishes directly; 2+ images publish as a swipeable
// carousel (each image becomes a child container, then a parent CAROUSEL
// container references all of them) — the format users can slide through
// instead of a single photo + a caption they have to open and read.
export async function publishToInstagram(
  imageUrls: string[],
  caption: string,
  credentials?: { igUserId: string; accessToken: string },
): Promise<string> {
  // Our OWN marker wins — the one generated in the App Dashboard, which
  // carries every permission the app holds at Standard Access, including
  // instagram_business_content_publish. loadPublishToken returns the rotated
  // copy from the database when there is one and falls back to the env var
  // otherwise, so this works before the cron has seeded the table.
  //
  // The customer's connection token is the fallback, not the other way round:
  // it comes from the Business Login flow, whose scope list is deliberately
  // narrow, and Instagram silently drops a scope that flow is not configured
  // to grant. On 2026-09-07 that produced four identical "Application does not
  // have permission for this action" failures — the grant came back with only
  // basic, manage_messages and manage_comments, confirmed in the callback log.
  const ownToken = await loadPublishToken()
  const accessToken = ownToken || credentials?.accessToken
  if (!accessToken) throw new Error('Instagram not configured')
  const igUserId = ownToken ? await resolveIgUserId(ownToken) : credentials!.igUserId
  if (imageUrls.length === 0) throw new Error('No images provided')

  let creationId: string
  if (imageUrls.length === 1) {
    creationId = await createContainer(igUserId, accessToken, { image_url: imageUrls[0], caption })
    await waitUntilFinished(creationId, accessToken)
  } else {
    const childIds = await Promise.all(
      imageUrls.map(url => createContainer(igUserId, accessToken, { image_url: url, is_carousel_item: 'true' }))
    )
    await Promise.all(childIds.map(id => waitUntilFinished(id, accessToken)))
    creationId = await createContainer(igUserId, accessToken, {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
    })
    await waitUntilFinished(creationId, accessToken)
  }

  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  })
  const publishData = await publishRes.json()
  if (!publishRes.ok || !publishData.id) {
    throw new Error(publishData.error?.message || 'Failed to publish media')
  }

  return publishData.id as string
}

export interface MediaInsights {
  reach: number | null
  likes: number | null
  comments: number | null
  saved: number | null
  shares: number | null
}

export async function getMediaInsights(igMediaId: string): Promise<MediaInsights> {
  // Same token as publishing: insights are read for OUR posts on OUR account,
  // and reading the env var directly here would break the moment the rotated
  // copy diverges from it.
  const accessToken = await loadPublishToken()
  if (!accessToken) throw new Error('Instagram not configured')

  const res = await fetch(
    `${GRAPH_API}/${igMediaId}/insights?metric=reach,likes,comments,saved,shares&access_token=${accessToken}`
  )
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to fetch media insights')
  }

  const byName: Record<string, number> = {}
  for (const entry of data.data || []) {
    byName[entry.name] = entry.values?.[0]?.value ?? null
  }

  return {
    reach: byName.reach ?? null,
    likes: byName.likes ?? null,
    comments: byName.comments ?? null,
    saved: byName.saved ?? null,
    shares: byName.shares ?? null,
  }
}

// Thrown instead of a bare Error so callers that need to distinguish "the
// token is dead" (401 -- Task 8/9 mark the connection token_expired) from
// any other failure (transient, malformed request, etc.) can do so without
// parsing error message text. Still an Error, so the existing
// single-tenant caller's `console.error(err.message)` handling needs no
// changes.
export class InstagramApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'InstagramApiError'
  }
}

// Replies to a comment on any post on the account (not just ones published
// through our own draft-approval flow) — Instagram's own comment-reply
// endpoint, scoped by the comment's own ID rather than a media ID.
export async function replyToComment(commentId: string, message: string, credentials?: { accessToken: string }): Promise<void> {
  const accessToken = credentials?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN
  if (!accessToken) throw new Error('Instagram not configured')

  const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new InstagramApiError(data.error?.message || 'Failed to reply to comment', res.status)
  }
}

// Sends a direct message reply. `recipientId` is the sender's Instagram-
// scoped user ID from the incoming webhook event, not a username.
export async function sendDirectMessage(recipientId: string, message: string, credentials?: { igUserId: string; accessToken: string }): Promise<void> {
  const igUserId = credentials?.igUserId ?? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const accessToken = credentials?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN
  if (!igUserId || !accessToken) throw new Error('Instagram not configured')

  const res = await fetch(`${GRAPH_API}/${igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      access_token: accessToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new InstagramApiError(data.error?.message || 'Failed to send direct message', res.status)
  }
}

const INSTAGRAM_QUICK_REPLY_TITLE_MAX = 20
const INSTAGRAM_QUICK_REPLY_MAX = 13

interface InstagramFlowMessage {
  text: string
  quick_replies?: { content_type: 'text'; title: string; payload: string }[]
}

// Pure -- decides Instagram's native quick-reply shape for a flow step.
// FlowBuilder.tsx already caps a step at 8 buttons, so the >13 truncation
// branch below is defensive (unreachable via the UI today).
export function buildInstagramFlowMessage(step: FlowStep): InstagramFlowMessage {
  if (step.buttons.length === 0) return { text: step.text }
  if (step.buttons.length > INSTAGRAM_QUICK_REPLY_MAX) {
    console.error('ai-agent flow: step', step.id, 'has', step.buttons.length, 'buttons -- Instagram quick replies cap at', INSTAGRAM_QUICK_REPLY_MAX, ', truncating')
  }
  const quick_replies = step.buttons.slice(0, INSTAGRAM_QUICK_REPLY_MAX).map((b, i) => ({
    content_type: 'text' as const,
    title: b.label.slice(0, INSTAGRAM_QUICK_REPLY_TITLE_MAX),
    payload: `btn:${step.id}:${i}`,
  }))
  return { text: step.text, quick_replies }
}

// Sends one flow step as a DM -- text or quick replies depending on button
// count (buildInstagramFlowMessage). Same send shape as sendDirectMessage,
// just with a richer `message` object.
export async function sendInstagramFlowStep(recipientId: string, step: FlowStep, credentials: { igUserId: string; accessToken: string }): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${credentials.igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: buildInstagramFlowMessage(step),
      access_token: credentials.accessToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new InstagramApiError(data.error?.message || 'Failed to send flow step', res.status)
  }
}
