import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { saveEsfConnection } from '@/lib/esfXml/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).maybeSingle()
  if (!getActivePlan(profile).canEsf) return NextResponse.json({ error: 'Требуется тариф Про' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const { login, password, vatCertificateNum, vatCertificateSeries } = body || {}
  if (!login || !password) return NextResponse.json({ error: 'login и password обязательны' }, { status: 400 })

  await saveEsfConnection(user.id, login, password, vatCertificateNum || null, vatCertificateSeries || null)
  return NextResponse.json({ ok: true })
}
