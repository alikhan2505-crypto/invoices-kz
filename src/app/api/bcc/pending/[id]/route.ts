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

// bcc_pending_matches has RLS enabled with a SELECT policy only — there is no
// DELETE policy for `authenticated`, so a delete issued from the browser is
// silently filtered to zero rows and returns {data: null, error: null}, i.e.
// looks like it worked while the row survives. Deletes therefore go through
// this route on the service-role client instead.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Scoped by user_id as well as id — the service-role client bypasses RLS, so
  // without it any authenticated user could delete another user's pending
  // match by guessing its id.
  const { error } = await supabase
    .from('bcc_pending_matches')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('BCC pending match delete error:', error.message)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
