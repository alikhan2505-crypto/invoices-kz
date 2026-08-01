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

// kaspi_connections has zero client-facing RLS policies (Task 3) — the page
// cannot query it directly, same reasoning as /api/bcc/status.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Deliberately NOT filtered to status='active' any more: the polling cron
  // parks a connection at 'error' when Kaspi has refused its credentials or
  // its stored secrets stopped decrypting, and the page has to be able to
  // tell that apart from "never connected" so it can show the reconnect hint
  // (and keep the disconnect button reachable). Same shape as /api/bcc/status.
  const { data } = await supabase
    .from('kaspi_connections')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ connected: !!data, status: data?.status ?? null })
}
