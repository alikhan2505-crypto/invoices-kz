import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/wildberries/connection'
import { fetchWbProducts } from '@/lib/wildberries/catalog'

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// Live fetch on every call, nothing persisted -- see the plan's Global
// Constraints on why (WB bills cloud services per API call as of Jan 2026;
// a live-on-view fetch costs nothing when nobody is looking at the page).
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'not_connected' }, { status: 404 })

  try {
    const products = await fetchWbProducts(connection.token)
    return NextResponse.json({ products })
  } catch (e: any) {
    console.error('wildberries products: fetch failed for user', user.id, ':', e.message)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 })
  }
}
