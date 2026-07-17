const GRAPH_API = 'https://graph.facebook.com/v21.0'

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
