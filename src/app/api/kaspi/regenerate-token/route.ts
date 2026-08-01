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

// Regenerates the API token WITHOUT touching the underlying Kaspi device
// pairing — same connection, same tokenSn/totpSeed, just a new bearer
// credential. For when a token may have been exposed (shown in a
// screenshot, pasted somewhere) but the Cashier pairing itself is fine.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiToken = crypto.randomBytes(32).toString('hex')
  const apiTokenHash = crypto.createHash('sha256').update(apiToken).digest('hex')

  const { error } = await supabase
    .from('kaspi_connections')
    .update({ api_token_hash: apiTokenHash })
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })

  return NextResponse.json({ apiToken })
}
