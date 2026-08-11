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

async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase.from('instagram_autoreply_settings').select('id, paused').single()
  return NextResponse.json({ paused: data?.paused ?? false })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { paused } = await req.json()
  if (typeof paused !== 'boolean') return NextResponse.json({ error: 'paused (boolean) required' }, { status: 400 })

  const { data: existing } = await supabase.from('instagram_autoreply_settings').select('id').single()
  if (!existing) return NextResponse.json({ error: 'Settings row not found' }, { status: 500 })

  await supabase
    .from('instagram_autoreply_settings')
    .update({ paused, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  return NextResponse.json({ ok: true })
}
