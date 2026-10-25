import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'
import { getPlanAmount, type BillingPeriod } from '@/lib/plans/pricing'
import { checkAndSettlePlanPayment, refundDeadPlanWalletHolds, type PlanPaymentRow } from '@/lib/kaspiPay/settlePlanPayment'
import { quoteWalletPlanPayment, startPlanPaymentWithWalletHold } from '@/lib/plans/walletPlanPayment'
import { resolveWalletPart } from '@/lib/plans/planActivation'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// This route hits the single shared platform Kaspi connection (not a
// per-customer one) -- unbounded calls from one user could get the one
// connection every customer's billing depends on flagged by Kaspi.
const PLAN_PAYMENT_RATE_LIMIT = 5
const PLAN_PAYMENT_RATE_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  // Удержания с кошелька у старых строк, закрытых ниже, при useWallet не
  // возвращаются сразу: start_plan_payment_with_wallet забирает их себе той
  // же транзакцией. Если новый платёж с кошельком так и не создан (любая
  // ошибка, кошелёк покрывает всё, кошелёк не понадобился), возвращаем их
  // здесь — деньги не зависают до ночного крона.
  const deferred: { userId: string | null; moved: boolean } = { userId: null, moved: false }
  try {
    return await createPlanPayment(req, deferred)
  } finally {
    if (deferred.userId && !deferred.moved) {
      try { await refundDeadPlanWalletHolds(deferred.userId) } catch (e: any) {
        console.error('Payment create: deferred wallet hold refund failed — the daily sweep will retry:', e?.message)
      }
    }
  }
}

async function createPlanPayment(req: NextRequest, deferred: { userId: string | null; moved: boolean }) {
  try {
    const { userId, plan, period, useWallet, walletAmount } = await req.json()
    if (!userId || !plan || (plan !== 'pro' && plan !== 'basic')) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }
    if (period !== undefined && period !== null && period !== 'monthly' && period !== 'annual') {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
    }
    const billingPeriod: BillingPeriod = period === 'annual' ? 'annual' : 'monthly'

    // Сколько списать с кошелька (целые тенге). Формат проверяется до того, как
    // что-либо тронуто: ни Kaspi-операции, ни закрытия старых платежей, ни
    // удержания. Допустимые границы (баланс, цена, минимум на Kaspi) сервер
    // проверяет ниже по свежему балансу, сумме из браузера верить нельзя.
    // Без walletAmount работает прежний useWallet:true (= максимум).
    const hasWalletAmount = walletAmount !== undefined && walletAmount !== null
    if (hasWalletAmount && (typeof walletAmount !== 'number' || !Number.isSafeInteger(walletAmount) || walletAmount < 0)) {
      return NextResponse.json({ error: 'invalid_wallet_amount' }, { status: 400 })
    }

    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    const { data: { user } } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null } }
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { count: recentCount, error: rateError } = await supabase
      .from('payment_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - PLAN_PAYMENT_RATE_WINDOW_MS).toISOString())
    if (rateError) console.error('Payment create: rate-limit count failed, allowing request:', rateError.message)
    else if ((recentCount ?? 0) >= PLAN_PAYMENT_RATE_LIMIT) {
      console.error('Payment create: rate limit hit for user', userId, `— ${recentCount} requests in the last minute`)
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // Same reasoning as create-phone/route.ts's identical check: the rate
    // limit above only stops rapid spam, not a customer creating a second
    // real Kaspi operation a minute or more later because the first one's
    // confirmation wasn't obviously visible. Blocks on ANY pending request
    // regardless of which route created it (both write the same table).
    //
    // A Kaspi QR dies after ~5 minutes, but the row it left behind stays
    // 'pending' until the daily 04:00 cron sweeps it. That combination locked
    // a customer out of paying for up to 24 hours: the QR they were looking
    // at was already dead, and every retry answered 409 already_pending. So
    // settle the pending rows against Kaspi FIRST -- checkAndSettlePlanPayment
    // marks anything Kaspi reports as expired -- and only refuse when a
    // genuinely live payment is still waiting to be paid.
    const { data: pendingRows, error: pendingError } = await supabase
      .from('payment_requests')
      .select('id, user_id, plan, amount, qr_operation_id, created_at, billing_period')
      .eq('user_id', userId)
      .eq('status', 'pending')
    const deferWalletRefund = hasWalletAmount ? walletAmount > 0 : useWallet === true
    if (deferWalletRefund) deferred.userId = userId
    if (pendingError) console.error('Payment create: pending-check failed, allowing request:', pendingError.message)
    else if ((pendingRows?.length ?? 0) > 0) {
      for (const row of pendingRows as PlanPaymentRow[]) {
        try {
          // force: the caller is asking for a payable QR right now, so any
          // older one is being abandoned by definition. Refusing instead
          // (the previous behaviour) left customers staring at "у вас уже
          // есть неподтверждённый платёж" with no way forward until the
          // nightly cron cleared it. /kaspi-api has always worked this way.
          const result = await checkAndSettlePlanPayment(row, { force: true, deferWalletRefund })
          if (result === 'paid') {
            // Settling just activated the plan from a QR the customer had
            // already paid. Same as create-phone: report it as a successful
            // outcome instead of minting a second operation they'd be
            // charged for.
            return NextResponse.json({ error: 'already_paid' }, { status: 409 })
          }
        } catch (e: any) {
          // Kaspi unreachable: leave the row for the cron and carry on. The
          // rate limit above is what stops this becoming a way to mint
          // operations in bulk.
          console.error('Payment create: could not settle pending row', row.id, '— leaving it for the next sweep:', e.message)
        }
      }
    }

    const connection = await loadPlatformConnection()
    if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

    const amount = getPlanAmount(plan, billingPeriod)

    // «Списать часть с кошелька, остальное через Kaspi». Считается ПОСЛЕ
    // закрытия старых pending-строк выше; их удержания входят в баланс
    // расчёта (quoteWalletPlanPayment) и переезжают на новую строку внутри
    // start_plan_payment_with_wallet. Целиком с кошелька — не здесь, а в
    // /api/payment/wallet (там нет Kaspi-операции вовсе).
    let walletPart = 0
    if (deferWalletRefund) {
      const quote = await quoteWalletPlanPayment(userId, plan, billingPeriod)
      if (!quote.available) return NextResponse.json({ error: 'wallet_unavailable' }, { status: 503 })
      if (hasWalletAmount) {
        // Явная сумма: принимаем ровно её или отказываем. Не уменьшаем и не
        // увеличиваем молча, иначе QR на Kaspi запросил бы не ту сумму, на
        // которую человек согласился.
        const picked = resolveWalletPart(amount, quote.balance, walletAmount)
        if (!picked.ok) {
          return NextResponse.json({ error: 'wallet_changed', reason: picked.reason, max: picked.max, can_pay_full: picked.canPayFull }, { status: 409 })
        }
        // Целиком с кошелька Kaspi-операции нет вовсе: это /api/payment/wallet.
        if (picked.mode === 'wallet_full') {
          return NextResponse.json({ error: 'wallet_use_full_endpoint' }, { status: 409 })
        }
        walletPart = picked.wallet
      } else {
        if (quote.split.mode === 'wallet_full') return NextResponse.json({ error: 'wallet_covers_full' }, { status: 409 })
        walletPart = quote.split.mode === 'partial' ? quote.split.wallet : 0
      }
    }
    const kaspiAmount = amount - walletPart

    const payment = await createPayment(connection, { amount: kaspiAmount, orderId: `${userId}__${plan}__${Date.now()}` })

    if (walletPart > 0) {
      // Строка платежа и удержание с кошелька — одной транзакцией в базе.
      // Не вышло (баланс успел уменьшиться) — строки нет, QR никому не
      // показан, выпущенная операция просто истечёт у Kaspi.
      const hold = await startPlanPaymentWithWalletHold({ user, plan, period: billingPeriod, walletPart, operationId: payment.operationId })
      if (!hold.ok) {
        const status = hold.error === 'unavailable' ? 503 : hold.error === 'server_error' ? 502 : 409
        return NextResponse.json({ error: hold.error === 'insufficient_funds' ? 'wallet_changed' : `wallet_${hold.error}` }, { status })
      }
      deferred.moved = true
      return NextResponse.json({
        qr_token: payment.paymentLink,
        ext_tran_id: payment.operationId,
        expire_date: payment.expiresAt,
        kaspi_amount: kaspiAmount,
        wallet_amount: walletPart,
        wallet_balance: hold.balance,
      })
    }

    const { error: insertError } = await supabase.from('payment_requests').insert({
      user_id: userId,
      email: user.email,
      plan,
      amount,
      billing_period: billingPeriod,
      status: 'pending',
      order_id: payment.operationId,
      qr_operation_id: payment.operationId,
    })
    if (insertError) {
      console.error('Plan payment created but failed to persist for tracking — operation', payment.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }

    return NextResponse.json({
      qr_token: payment.paymentLink,
      ext_tran_id: payment.operationId,
      expire_date: payment.expiresAt,
      kaspi_amount: amount,
      wallet_amount: 0,
    })
  } catch (e: any) {
    console.error('Payment create error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
