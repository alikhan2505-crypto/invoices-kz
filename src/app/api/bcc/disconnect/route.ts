import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE } from '@/lib/bccAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connection } = await supabase
    .from('bcc_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (connection) {
    try {
      const appToken = await getBccAppToken()
      await fetch(`${BCC_AUTH_CLIENT_BASE}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appToken}`,
        },
        body: JSON.stringify({ token: connection.access_token }),
      })
    } catch (e: any) {
      // Best-effort — even if BCC's revoke call fails, we still remove our
      // own copy of the token below so the user's disconnect always
      // succeeds from their point of view.
      console.error('BCC revoke error:', e.message)
    }
  }

  await supabase.from('bcc_pending_matches').delete().eq('user_id', user.id)
  await supabase.from('bcc_connections').delete().eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
