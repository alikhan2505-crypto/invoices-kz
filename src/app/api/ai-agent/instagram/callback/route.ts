import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyOAuthState } from '@/lib/aiAgent/oauthState'
import { getKey } from '@/lib/aiAgent/connection'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Instagram redirects the BROWSER here after the user authorizes -- no
// Authorization header available (this is a real navigation, not our own
// fetch), so the user is identified via the signed `state` param instead
// (Task 4's oauthState, not a session cookie this codebase doesn't use for
// API routes). Real Instagram Business Login flow, confirmed against
// Meta's own docs/examples 2026-08-15: authorize -> code -> short-lived
// token (api.instagram.com/oauth/access_token) -> long-lived token
// (graph.instagram.com/access_token?grant_type=ig_exchange_token) -> /me
// for the connected account's identity. VERIFY the exact request/response
// shape live against a real registered app before the first real connect
// attempt -- Meta's documentation for this specific multi-step exchange
// was not fully cross-confirmed during planning (the authorize step was
// confirmed live; the two-step token exchange below matches this
// codebase's best available reference for the flow, not a live-tested
// round trip).
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.invoices.kz'
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const oauthError = req.nextUrl.searchParams.get('error')

  if (oauthError || !code || !state) {
    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_error=1`)
  }
  const verified = verifyOAuthState(state)
  if (!verified) {
    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_error=1`)
  }

  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  const redirectUri = `${appUrl}/api/ai-agent/instagram/callback`
  if (!appId || !appSecret) {
    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_error=1`)
  }

  try {
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_message || 'short-lived token exchange failed')
    }

    const longLivedRes = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${tokenData.access_token}`)
    const longLivedData = await longLivedRes.json()
    if (!longLivedRes.ok || !longLivedData.access_token) {
      throw new Error('long-lived token exchange failed')
    }

    const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=${longLivedData.access_token}`)
    const meData = await meRes.json()
    if (!meRes.ok || !meData.user_id) {
      throw new Error('failed to identify the connected Instagram account')
    }

    const { data: agent } = await supabase.from('ai_agents').select('id').eq('user_id', verified.userId).single()
    if (!agent) throw new Error('no agent found for this user -- settings must be saved before connecting a channel')

    const encryptedToken = encryptAtRest(longLivedData.access_token, getKey())
    const { error: upsertError } = await supabase.from('ai_agent_channel_connections').upsert({
      agent_id: agent.id,
      channel: 'instagram',
      external_account_id: String(meData.user_id),
      external_account_name: meData.username || null,
      access_token_enc: encryptedToken,
      status: 'active',
    }, { onConflict: 'channel,external_account_id' })
    if (upsertError) throw new Error(upsertError.message)

    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_connected=1`)
  } catch (e: any) {
    console.error('ai-agent Instagram OAuth callback failed:', e.message)
    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_error=1`)
  }
}
