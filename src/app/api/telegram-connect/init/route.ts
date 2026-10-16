import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { connectTokenExpiresAt, isConnectTokenReusable, mintConnectToken } from '@/lib/telegramConnectToken'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Generates a single-use, short-lived token and stores it on the caller's own
// profile — the webhook looks a user up BY this token when the deep-link's
// /start message arrives, and rejects it once it is older than
// TELEGRAM_CONNECT_TTL_MS (the issue time is part of the token itself, see
// src/lib/telegramConnectToken.ts). The notifications page asks for a link on
// every visit, so a still-young unused token is handed back instead of being
// rotated — otherwise a second tab, or a mobile browser reloading the tab
// while the user is still in Telegram, would silently kill the link the user
// is about to press Start on.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const botUsername = process.env.CUSTOMER_TELEGRAM_BOT_USERNAME
  if (!botUsername) return NextResponse.json({ error: 'not_configured' }, { status: 500 })

  const { data: current, error: lookupError } = await supabase
    .from('profiles')
    .select('telegram_connect_token')
    .eq('id', user.id)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })

  const existing = current?.telegram_connect_token as string | null | undefined
  if (existing && isConnectTokenReusable(existing)) {
    return NextResponse.json({ token: existing, botUsername, expiresAt: connectTokenExpiresAt(existing) })
  }

  const token = mintConnectToken(crypto.randomBytes(24).toString('hex'))
  const { error } = await supabase
    .from('profiles')
    .update({ telegram_connect_token: token })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })

  return NextResponse.json({ token, botUsername, expiresAt: connectTokenExpiresAt(token) })
}
