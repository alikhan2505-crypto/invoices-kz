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

// The admin Telegram message below is sent with parse_mode: HTML. These
// fields are free text the customer typed into their own profile -- an
// unescaped "<" or "&" in a company name is enough for Telegram to reject
// the ENTIRE message with a silent 400, which is exactly the shape of bug
// that could explain a notification never arriving with no error visible
// anywhere (found 2026-08-21 while investigating a real missed notice).
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Гасим всё, что продолжает работать от имени аккаунта без владельца: паузу
// Kaspi Shop, ИИ-агентов, повторяющиеся счета (cron/recurring слал бы письма
// клиентам удалённого аккаунта) и публичную витрину (/shop/[slug]). Каждый шаг
// независим и best-effort: сбой одного не должен блокировать удаление и
// остальные шаги. Колонки только существующие (kaspi_shop_connections.paused /
// storefront_published, ai_agents.is_enabled, invoices.recurring_active).
async function stopBackgroundActivity(userId: string) {
  const steps: [string, PromiseLike<{ error: { message: string } | null }>][] = [
    ['kaspi_shop_connections.paused', supabase.from('kaspi_shop_connections').update({ paused: true }).eq('user_id', userId)],
    ['kaspi_shop_connections.storefront_published', supabase.from('kaspi_shop_connections').update({ storefront_published: false }).eq('user_id', userId)],
    ['ai_agents.is_enabled', supabase.from('ai_agents').update({ is_enabled: false }).eq('user_id', userId)],
    ['invoices.recurring_active', supabase.from('invoices').update({ recurring_active: false }).eq('user_id', userId).eq('recurring_active', true)],
  ]
  const results = await Promise.allSettled(steps.map(([, q]) => q))
  results.forEach((r, i) => {
    const message = r.status === 'rejected' ? (r.reason?.message ?? String(r.reason)) : r.value.error?.message
    if (message) console.error('account delete: failed to stop', steps[i][0], 'for', userId, ':', message)
  })
}

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
  // Регистр и пробелы по краям не важны: «invoices.kz» — тоже подтверждение
  // (ревизия /profile 15.10.2026). Сравнение то же, что в модалке.
  const confirmText = typeof body?.confirmText === 'string' ? body.confirmText.trim().toUpperCase() : ''
  if (confirmText !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `Введите "${CONFIRM_PHRASE}" для подтверждения` }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_name, email, bin_iin, created_at, deleted_at, is_admin')
    .eq('id', user.id)
    .single()
  if (profileError || !profile) return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 })

  // Аккаунт администратора удалить отсюда нельзя: одно неловкое нажатие —
  // и платформа теряет админа (его тестовые данные, доступ к /admin).
  // Модалка отказывает так же; это — граница на сервере.
  if (profile.is_admin) {
    return NextResponse.json({ error: 'Аккаунт администратора удалить нельзя', code: 'admin_account' }, { status: 403 })
  }

  if (profile.deleted_at) {
    // Already flagged deleted in a previous attempt -- most likely the auth
    // deletion below failed last time. Retry just that step, silently, no
    // duplicate stats/Telegram noise.
    await stopBackgroundActivity(user.id)
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
  await stopBackgroundActivity(user.id)

  try {
    const statsLine = daysAsCustomer !== null
      ? `📅 Клиент ${daysAsCustomer} дн.\n🧾 Счетов: ${invoicesCount ?? 0}\n💰 Заработали: ${revenueTenge.toLocaleString('ru-KZ')} ₸`
      : `🧾 Счетов: ${invoicesCount ?? 0}\n💰 Заработали: ${revenueTenge.toLocaleString('ru-KZ')} ₸`
    const tgRes = await fetch('https://invoices.kz/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
      body: JSON.stringify({
        message: `🗑 <b>Удаление аккаунта</b>\n👤 ${escapeHtml(profile.company_name || user.id)}\n📧 ${escapeHtml(profile.email || user.email || '')}${profile.bin_iin ? '\n🔢 БИН: ' + escapeHtml(profile.bin_iin) : ''}\n${statsLine}`,
      }),
    })
    if (!tgRes.ok) {
      console.error('account delete: Telegram notification rejected for', user.id, ':', tgRes.status, await tgRes.text().catch(() => ''))
    }
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
