import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signPlannerCookie } from '@/lib/plannerSession'
import { PLANNER_COOKIE_NAME } from '@/lib/plannerAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Без авторизации (устройство ещё не залогинено), поэтому ответ никогда не
// содержит owner_profile_id или что-либо из профиля -- аноним, знающий
// только code, не должен узнать ничего сверх трёх статусов.
//
// Кука ставится ЗДЕСЬ, на сервере, повторно читающем статус строки из базы
// в этом же запросе -- никакого отдельного маршрута "выдай мне куку",
// который бы поверил утверждению браузера "я видел confirmed".
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') || ''
  if (!code) return NextResponse.json({ error: 'bad_code' }, { status: 400 })

  const { data: session } = await supabase
    .from('planner_sessions')
    .select('status, site_id, owner_profile_id, expires_at')
    .eq('code', code)
    .maybeSingle()

  if (!session) return NextResponse.json({ status: 'expired' })

  if (session.status === 'pending') {
    const expired = new Date(session.expires_at).getTime() < Date.now()
    return NextResponse.json({ status: expired ? 'expired' : 'pending' })
  }

  // confirmed
  if (!session.owner_profile_id) return NextResponse.json({ status: 'expired' })

  const { data: site } = await supabase.from('salon_sites').select('slug').eq('id', session.site_id).maybeSingle()
  if (!site) return NextResponse.json({ status: 'expired' })

  const cookie = signPlannerCookie({ ownerProfileId: session.owner_profile_id, siteId: session.site_id })
  const res = NextResponse.json({ status: 'confirmed', siteSlug: site.slug })
  res.cookies.set(PLANNER_COOKIE_NAME, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  })
  return res
}
