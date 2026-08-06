import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Generates a single-use token and stores it on the caller's own profile —
// the webhook (Task 4) looks a user up BY this token when the deep-link's
// /start message arrives. Calling this again before finishing a previous
// attempt just overwrites the old token; only the most recent one is ever
// valid, which is fine since a user can only be mid-deep-link once at a time.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const botUsername = process.env.CUSTOMER_TELEGRAM_BOT_USERNAME
  if (!botUsername) return NextResponse.json({ error: 'not_configured' }, { status: 500 })

  const token = crypto.randomBytes(24).toString('hex')
  const { error } = await supabase
    .from('profiles')
    .update({ telegram_connect_token: token })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })

  return NextResponse.json({ token, botUsername })
}
