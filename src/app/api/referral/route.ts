import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId, referralCode } = await req.json()
  if (!userId || !referralCode) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

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

  // НЕ меняем plan если у него уже pro или basic — только бонус и счётчик
  const referrerUpdate: any = {
    referral_count: (referrer.referral_count || 0) + 1,
    bonus_expires_at: referrerBonusBase.toISOString(),
  }
  // Если free — даём basic через бонус
  if (!referrer.plan || referrer.plan === 'free') {
    referrerUpdate.plan = 'basic'
  }

  await supabase.from('profiles')
    .update(referrerUpdate)
    .eq('id', referrer.id)

  // +7 дней новому пользователю (бонус начинается с сегодня)
  const newUserExpiry = new Date()
  newUserExpiry.setDate(newUserExpiry.getDate() + 7)

  await supabase.from('profiles').update({
    referred_by: referralCode,
    bonus_expires_at: newUserExpiry.toISOString(),
    plan: 'basic'
  }).eq('id', userId)

  return NextResponse.json({ success: true })
}