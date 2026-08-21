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

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Called once from onboarding on first load. Runs server-side (not a plain
// client query) because profiles RLS scopes SELECT to the caller's own row
// -- a fresh signup has no profile row yet, so it could never see a PRIOR
// deleted one under RLS. Matches by the authenticated user's OWN verified
// email (never a client-supplied one), so this can't be used to probe
// whether an arbitrary email was ever deleted.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.email) return NextResponse.json({ returning: false })

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', user.email)
    .not('deleted_at', 'is', null)
    .neq('id', user.id)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ returning: !!data })
}
