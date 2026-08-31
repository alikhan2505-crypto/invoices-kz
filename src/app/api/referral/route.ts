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

export async function POST(req: NextRequest) {
  const { userId, referralCode } = await req.json()
  if (!userId || !referralCode) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user || user.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Находим владельца реферального кода
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id, plan, referral_count, bonus_expires_at, plan_expires_at')
    .eq('referral_code', referralCode)
    .single()

  if (!referrer) return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 })
  if (referrer.id === userId) return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 })

  // Проверяем не использовал ли этот пользователь уже реф код
  const { data: newUserProfile } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', userId)
    .single()

  if (newUserProfile?.referred_by) {
    return NextResponse.json({ error: 'Already used referral code' }, { status: 400 })
  }

  // +7 дней тому кто пригласил (добавляем к существующим бонусам)
  const now = new Date()
  const referrerBonusBase = referrer.bonus_expires_at && new Date(referrer.bonus_expires_at) > now
    ? new Date(referrer.bonus_expires_at)  // продлеваем от текущего бонуса
    : now                                   // начинаем с сегодня

  referrerBonusBase.setDate(referrerBonusBase.getDate() + 7)

  // НЕ меняем plan — бонусные дни сами дают Базовый через getActivePlan's
  // bonus_expires_at branch (см. src/lib/plan.ts). Раньше здесь писали
  // plan: 'basic' без plan_expires_at, что getActivePlan трактует как
  // платный план БЕЗ срока — т.е. Базовый навсегда и бесплатно. Только
  // бонус и счётчик.
  const referrerUpdate: any = {
    referral_count: (referrer.referral_count || 0) + 1,
    bonus_expires_at: referrerBonusBase.toISOString(),
  }

  await supabase.from('profiles')
    .update(referrerUpdate)
    .eq('id', referrer.id)

  // +7 дней новому пользователю (бонус начинается с сегодня). plan
  // намеренно не трогаем — та же причина, что и выше для referrerUpdate.
  const newUserExpiry = new Date()
  newUserExpiry.setDate(newUserExpiry.getDate() + 7)

  await supabase.from('profiles').update({
    referred_by: referralCode,
    bonus_expires_at: newUserExpiry.toISOString(),
  }).eq('id', userId)

  return NextResponse.json({ success: true })
}