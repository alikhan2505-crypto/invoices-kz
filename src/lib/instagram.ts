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
