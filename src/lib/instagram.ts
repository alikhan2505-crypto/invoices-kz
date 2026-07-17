// "Instagram API with Instagram Login" tokens (prefixed IGAA...) are only
// valid against graph.instagram.com — the classic graph.facebook.com host
// (used by the older Facebook-Login flavor of this API) can't parse them
// at all, which surfaces as an opaque "Cannot parse access token" error.
const GRAPH_API = 'https://graph.instagram.com/v21.0'

export async function publishToInstagram(imageUrl: string, caption: string): Promise<string> {
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!igUserId || !accessToken) throw new Error('Instagram not configured')

  const containerRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken }),
  })
  const containerData = await containerRes.json()
  if (!containerRes.ok || !containerData.id) {
    throw new Error(containerData.error?.message || 'Failed to create media container')
  }

  // Instagram processes the container asynchronously — publishing before it
  // reports FINISHED fails with an opaque "Media ID is not available".
  for (let attempt = 0; attempt < 10; attempt++) {
    const statusRes = await fetch(
      `${GRAPH_API}/${containerData.id}?fields=status_code&access_token=${accessToken}`
    )
    const statusData = await statusRes.json()
    if (statusData.status_code === 'FINISHED') break
    if (statusData.status_code === 'ERROR') {
      throw new Error('Instagram failed to process the media container')
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }

  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
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
