import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createInvoiceByPhone } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MIN_TOPUP = 1000

// Same shared-platform-connection reasoning as the QR topup route next door.
const TOPUP_RATE_LIMIT = 5
const TOPUP_RATE_WINDOW_MS = 60_000

// Kaspi wants a bare 11-digit number starting 7. The UI sends it formatted
// ("+7 777 123 45 67"), so strip everything else before validating.
function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 11 || !digits.startsWith('7')) return null
  return digits
}

// The QR route's sibling: instead of a code to scan, Kaspi pushes a payment
// request straight into the customer's own Kaspi app. Subscriptions have had
// this since /api/payment/create-phone; the wallet only had the QR, which is
// useless to someone reading the page on the same phone that has Kaspi
// installed and no second device to scan with.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount, phone } = await req.json()
  if (!amount || typeof amount !== 'number' || amount < MIN_TOPUP) {
    return NextResponse.json({ error: 'invalid_amount', min: MIN_TOPUP }, { status: 400 })
  }
  const phoneNumber = normalizePhone(phone)
  if (!phoneNumber) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })

  const { count: recentCount, error: rateError } = await supabase
    .from('kaspi_wallet_topups')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - TOPUP_RATE_WINDOW_MS).toISOString())
  if (rateError) console.error('Wallet phone topup: rate-limit count failed, allowing request:', rateError.message)
  else if ((recentCount ?? 0) >= TOPUP_RATE_LIMIT) {
    console.error('Wallet phone topup: rate limit hit for user', user.id, `— ${recentCount} requests in the last minute`)
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const connection = await loadPlatformConnection()
  if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

  try {
    const invoice = await createInvoiceByPhone(connection, {
      phoneNumber,
      amount,
      comment: 'Пополнение баланса INVOICES.KZ',
    })

    // No qr_token/payment_link: Kaspi's remote/create hands back only an
    // operation id, and there is nothing for the payer to scan. expires_at
    // stays null on purpose -- a pushed request lives longer than a QR, and
    // checkAndSettleWalletTopup's isPastExpiry() treats null as "no local
    // deadline", so nothing expires it early. The daily cron still sweeps it.
    const { data: inserted, error: insertError } = await supabase
      .from('kaspi_wallet_topups')
      .insert({
        user_id: user.id,
        amount,
        kaspi_operation_id: invoice.operationId,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insertError) {
      console.error('Wallet phone topup created but failed to persist — operation', invoice.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }
    return NextResponse.json({ topup_id: inserted.id })
  } catch (e: any) {
    console.error('Wallet phone topup create error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
}
