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

// The exact phrase the user must type in the confirmation modal, matching
// the founder's request ("наберёт название INVOICES.KZ").
const CONFIRM_PHRASE = 'INVOICES.KZ'

// Soft delete (founder-approved, 2026-08-21): the profile row is kept with
// deleted_at set -- it's how a later signup with the same email gets
// recognised as a returning customer (see onboarding/page.tsx) and how
// stats survive for the admin Telegram notice below. The Supabase Auth
// user itself IS actually deleted, so the person genuinely cannot log back
// into the old account; only a fresh signup gets them back in. Physically
// purging invoices/clients/history is a separate, later decision -- not
// part of this pass.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (body?.confirmText !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `Введите "${CONFIRM_PHRASE}" для подтверждения` }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_name, email, bin_iin, created_at, deleted_at')
    .eq('id', user.id)
    .single()
  if (profileError || !profile) return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 })

  if (profile.deleted_at) {
    // Already flagged deleted in a previous attempt -- most likely the auth
    // deletion below failed last time. Retry just that step, silently, no
    // duplicate stats/Telegram noise.
    const { error: retryError } = await supabase.auth.admin.deleteUser(user.id)
    if (retryError) {
      console.error('CRITICAL: account delete retry failed for', user.id, ':', retryError.message)
      return NextResponse.json({ error: 'Не удалось завершить удаление, обратитесь в поддержку' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const [{ count: invoicesCount }, { data: paidPayments }] = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('payment_requests').select('amount').eq('user_id', user.id).eq('status', 'paid'),
  ])
  const revenueTenge = (paidPayments || []).reduce((sum, p: any) => sum + Number(p.amount || 0), 0)
  const daysAsCustomer = profile.created_at
    ? Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000))
    : null

  // Stop background side-effects on this account before it's gone -- the
  // Kaspi Shop repricer and AI-агент auto-replies otherwise keep acting
  // (and spending the account's wallet balance) with no owner left to see
  // it. Best-effort: a failure here must not block the deletion itself.
  try {
    await Promise.all([
      supabase.from('kaspi_shop_connections').update({ paused: true }).eq('user_id', user.id),
      supabase.from('ai_agents').update({ is_enabled: false }).eq('user_id', user.id),
    ])
  } catch (e: any) {
    console.error('account delete: failed to pause background connections for', user.id, ':', e.message)
  }

  try {
    const statsLine = daysAsCustomer !== null
      ? `📅 Клиент ${daysAsCustomer} дн.\n🧾 Счетов: ${invoicesCount ?? 0}\n💰 Заработали: ${revenueTenge.toLocaleString('ru-KZ')} ₸`
      : `🧾 Счетов: ${invoicesCount ?? 0}\n💰 Заработали: ${revenueTenge.toLocaleString('ru-KZ')} ₸`
    await fetch('https://invoices.kz/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
      body: JSON.stringify({
        message: `🗑 <b>Удаление аккаунта</b>\n👤 ${profile.company_name || user.id}\n📧 ${profile.email || user.email}${profile.bin_iin ? '\n🔢 БИН: ' + profile.bin_iin : ''}\n${statsLine}`,
      }),
    })
  } catch (e: any) {
    console.error('account delete: Telegram notification failed for', user.id, ':', e.message)
  }

  const { error: markError } = await supabase
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', user.id)
  if (markError) {
    console.error('account delete: failed to mark profile deleted for', user.id, ':', markError.message)
    return NextResponse.json({ error: 'Не удалось удалить аккаунт' }, { status: 500 })
  }

  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id)
  if (authDeleteError) {
    // deleted_at is already committed -- data-wise the account is gone, but
    // the person could technically still be logged in until their session
    // expires. Logged loudly for manual follow-up rather than silently
    // reporting success.
    console.error('CRITICAL: account', user.id, 'marked deleted but auth deletion failed:', authDeleteError.message)
    return NextResponse.json({ error: 'Аккаунт помечен на удаление, но потребуется ручная доработка. Мы уже знаем об этом.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
