import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CODE_TTL_MS = 5 * 60 * 1000

// Без авторизации: это самый первый шаг для устройства, которое ещё никуда
// не залогинено (экран с QR на ресепшене). site_id разрешается по slug на
// сервере -- клиентскому id тут доверять нельзя, его никто и не передаёт.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  if (!slug) return NextResponse.json({ error: 'bad_slug' }, { status: 400 })

  const botUsername = process.env.CUSTOMER_TELEGRAM_BOT_USERNAME
  if (!botUsername) return NextResponse.json({ error: 'not_configured' }, { status: 500 })

  const { data: site } = await supabase.from('salon_sites').select('id').eq('slug', slug).maybeSingle()
  if (!site) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const code = crypto.randomBytes(24).toString('hex')
  const { error } = await supabase.from('planner_sessions').insert({
    code,
    site_id: site.id,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ code, botUsername, expiresInSeconds: CODE_TTL_MS / 1000 })
}
