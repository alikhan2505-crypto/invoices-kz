import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createOAuthState } from '@/lib/aiAgent/oauthState'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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
  // App Review decided this app's request on 2026-09-07: instagram_business_basic
  // and instagram_business_manage_messages are Advanced Access;
  // instagram_business_manage_comments was NOT approved (the screencast did not
  // show the permission being granted, so Meta could not see it in use).
  //
  // That rejection is the reason for the split below. Customers get only the two
  // approved scopes: asking for a permission the app does not hold risks
  // Instagram refusing the whole authorization, which would fail their connect
  // for a reason none of them could act on.
  //
  // App-role holders also get the comments scope, because at Standard Access
  // that is exactly who it still works for -- and because the re-submission
  // screencast has to show a user granting it. Recording the consent screen
  // without it would reproduce the very rejection we are answering.
  //
  // When Meta approves it, delete the branch and give all three to everyone.
  // instagram_business_content_publish is in the same position as comments:
  // rejected for Advanced Access, but Standard Access still covers people with
  // a role on the app -- which is who posts to our own account. It is here
  // because the 2026-09-07 reconnect (force_reauth=true) re-granted this
  // account's scopes from this very list, and posting was not on it, so the
  // token silently lost the permission and every approved draft failed with
  // "Application does not have permission for this action".
  //
  // Customers never get it: they do not publish to our feed, and asking for a
  // permission they have no use for would only widen their consent screen.
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  const scopes = profile?.is_admin
    ? 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish'
    : 'instagram_business_basic,instagram_business_manage_messages'
  // force_reauth makes the app user authorise from scratch even when Instagram
  // already has them logged in. Without it, an account that connected before
  // gets the short "you already connected invoices.kz-IG, continue?" screen,
  // which lists no permissions at all -- so a scope added since the last
  // connection is never actually granted, and the token silently keeps the old
  // set. That is why comments stopped arriving after 11.08 and why the 07.09
  // reconnect changed nothing.
  //
  // It also matters for App Review: the screencast has to show the user
  // granting the permission, and there is nothing to show on the short screen.
  const authorizeUrl = `https://www.instagram.com/oauth/authorize?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&force_reauth=true&state=${encodeURIComponent(state)}`

  return NextResponse.json({ authorizeUrl })
}
