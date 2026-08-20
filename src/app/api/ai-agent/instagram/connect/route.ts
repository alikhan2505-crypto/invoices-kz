import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createOAuthState } from '@/lib/aiAgent/oauthState'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Bearer-authed like every other route in this codebase -- called via a
// client-side fetch from the settings page (Task 6), NOT a plain browser
// navigation (a plain <a href> can't carry an Authorization header). The
// page reads the real authorizeUrl from this response, then does
// window.location.href = authorizeUrl itself to actually start the OAuth
// redirect to Instagram.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
  if (!appId) return NextResponse.json({ error: 'Instagram app not configured' }, { status: 500 })

  // Multi-agent (2026-08-20): the settings page passes which agent this
  // connection is for; it rides inside the signed state so the callback
  // attaches to the right agent. Ownership (agent belongs to this user) is
  // verified in the callback, which queries ai_agents by id AND user_id.
  const agentId = req.nextUrl.searchParams.get('agentId') || undefined
  const state = createOAuthState(user.id, agentId)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.invoices.kz'
  const redirectUri = `${appUrl}/api/ai-agent/instagram/callback`
  const scopes = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments'
  const authorizeUrl = `https://www.instagram.com/oauth/authorize?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(state)}`

  return NextResponse.json({ authorizeUrl })
}
