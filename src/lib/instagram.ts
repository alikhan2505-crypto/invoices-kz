import type { FlowStep } from './aiAgent/flow'

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

// A single image publishes directly; 2+ images publish as a swipeable
// carousel (each image becomes a child container, then a parent CAROUSEL
// container references all of them) — the format users can slide through
// instead of a single photo + a caption they have to open and read.
export async function publishToInstagram(imageUrls: string[], caption: string): Promise<string> {
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!igUserId || !accessToken) throw new Error('Instagram not configured')
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
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
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
