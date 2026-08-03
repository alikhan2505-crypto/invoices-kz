import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Regenerates the API token AND the webhook-signing secret together, as one
// "rotate credentials" action, WITHOUT touching the underlying Kaspi device
// pairing — same connection, same tokenSn/totpSeed, just new bearer/signing
// credentials. For when either may have been exposed (shown in a
// screenshot, pasted somewhere) but the Cashier pairing itself is fine.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.KASPI_SESSION_ENCRYPTION_KEY
  if (!key) return NextResponse.json({ error: 'not_configured' }, { status: 500 })

  const apiToken = crypto.randomBytes(32).toString('hex')
  const apiTokenHash = crypto.createHash('sha256').update(apiToken).digest('hex')
  const webhookSecret = crypto.randomBytes(32).toString('hex')

  // .update() alone reports no error and no row count when it matches zero
  // rows — without .select(), a user with no kaspi_connections row (never
  // connected, or disconnected) would silently get back a 200 and freshly
  // generated credentials that were never persisted anywhere and can never
  // authenticate or sign anything.
  const { data, error } = await supabase
    .from('kaspi_connections')
    .update({ api_token_hash: apiTokenHash, webhook_secret_enc: encryptAtRest(webhookSecret, key) })
    .eq('user_id', user.id)
    .select('user_id')
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'not_connected' }, { status: 404 })

  return NextResponse.json({ apiToken, webhookSecret })
}
