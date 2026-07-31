import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // bcc_connections has RLS enabled with no policies for `authenticated` —
  // by design, the browser can never read it directly. This route only ever
  // returns the caller's OWN connection status (a safe read, not a
  // privileged action), so no Pro-plan gate is needed here, mirroring the
  // reasoning already used for /api/bcc/disconnect.
  const { data: connection } = await supabase
    .from('bcc_connections')
    .select('iban, last_checked_at, status')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ connection: connection ?? null })
}
