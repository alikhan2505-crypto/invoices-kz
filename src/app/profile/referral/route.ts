import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(req: NextRequest) {
  const { userId, referralCode } = await req.json()
  if (!userId || !referralCode) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  // Находим владельца реферального кода
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id, referral_count, bonus_expires_at')
    .eq('referral_code', referralCode)
    .single()

  if (!referrer) return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 })
  if (referrer.id === userId) return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 })

  // Начисляем +7 дней тому кто пригласил
  const referrerExpiry = referrer.bonus_expires_at
    ? new Date(referrer.bonus_expires_at)
    : new Date()
  if (referrerExpiry < new Date()) referrerExpiry.setTime(new Date().getTime())
  referrerExpiry.setDate(referrerExpiry.getDate() + 7)

  await supabase.from('profiles').update({
    referral_count: (referrer.referral_count || 0) + 1,
    bonus_expires_at: referrerExpiry.toISOString(),
    plan: 'basic'
  }).eq('id', referrer.id)

  // Начисляем +7 дней новому пользователю
  const newUserExpiry = new Date()
  newUserExpiry.setDate(newUserExpiry.getDate() + 7)

  await supabase.from('profiles').update({
    referred_by: referralCode,
    bonus_expires_at: newUserExpiry.toISOString(),
    plan: 'basic'
  }).eq('id', userId)

  return NextResponse.json({ success: true })
}