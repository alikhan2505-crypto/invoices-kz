import { NextRequest, NextResponse } from 'next/server'
import { loadPublishToken } from '@/lib/instagramPublishToken'

// Pre-flight for "can we actually publish a post right now?".
//
// Exists because the only way to find out used to be to ask the founder to
// press Publish on a Telegram draft and watch it fail. That happened four
// times on 2026-09-07, each time with the same opaque "Application does not
// have permission for this action", and a failed draft cannot be retried — a
// fresh one had to be sent for every attempt.
//
// GET /<IG_ID>/content_publishing_limit is the cheap oracle: it is part of the
// Content Publishing API, so a token without instagram_business_content_publish
// is refused, while a token that has it returns the 24-hour post quota. Nothing
// is created or published either way.
//
// Also worth running around the 60-day mark: the dashboard-generated token
// expires, and publishing then fails with a permission-shaped error that looks
// nothing like "your token got old".

const GRAPH_API = 'https://graph.instagram.com/v21.0'

export async function GET(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== process.env.IG_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The same resolution publishToInstagram uses -- checking a different token
  // than the one that will actually publish would make this check a lie.
  const accessToken = await loadPublishToken()
  if (!accessToken) {
    return NextResponse.json({ ok: false, step: 'token', error: 'no stored token and INSTAGRAM_ACCESS_TOKEN is not set' })
  }

  const meRes = await fetch(`${GRAPH_API}/me?fields=user_id,username,followers_count,media_count&access_token=${accessToken}`)
  const me = await meRes.json()
  if (!meRes.ok || !me?.user_id) {
    return NextResponse.json({
      ok: false,
      step: 'identify',
      error: me?.error?.message || 'could not resolve the account from the token',
    })
  }

  const limitRes = await fetch(
    `${GRAPH_API}/${me.user_id}/content_publishing_limit?access_token=${accessToken}`
  )
  const limit = await limitRes.json()
  if (!limitRes.ok) {
    return NextResponse.json({
      ok: false,
      step: 'content_publish',
      username: me.username,
      error: limit?.error?.message || 'the token cannot use the Content Publishing API',
    })
  }

  return NextResponse.json({
    ok: true,
    username: me.username,
    igUserId: String(me.user_id),
    // Reported alongside the publishing check because a post's reach means
    // nothing without it: 12 posts averaging 11 people is a different problem
    // depending on whether the account has 20 followers or 2000.
    followers: me.followers_count ?? null,
    posts: me.media_count ?? null,
    quota: limit?.data?.[0] ?? null,
  })
}
