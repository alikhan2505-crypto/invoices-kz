import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import {
  submitOtp, isResumeToken, withConnectionRetry, resumeTokenFromSession,
  KaspiNetworkError, logNetworkFailure, unreachableResult,
} from '@/lib/kaspiShop/cabinetAuth'
import { listMerchants, getMerchantInfo } from '@/lib/kaspiShop/cabinetApi'
import { finalizeConnection } from '@/lib/kaspiShop/finalizeConnection'
import { listConnections } from '@/lib/kaspiShop/connection'

// Время на фоновое обновление каталога после ответа (after() в finalizeConnection).
export const maxDuration = 300

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

// Step 2: completes the real cabinet login, then discovers which merchant(s)
// this phone number can manage via listMerchants() (confirmed live
// 2026-08-13 -- one login can reach more than one seller account, e.g. a
// family member added as a user on a relative's shop). A single merchant is
// auto-selected and connected immediately, same behavior as before; more
// than one returns a picker for the seller to choose from, completed by
// POST /api/kaspi-shop/connect/select-merchant.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { otpToken, code, isReconnect } = body
  // A normal otpToken needs the SMS code. A resume token (issued in a previous
  // error response after Kaspi already ACCEPTED the code, see
  // cabinetAuth.submitOtp) must be sent back WITHOUT a code: the spent code is
  // not re-posted, only the redirect hops are re-walked.
  if (typeof otpToken !== 'string' || !otpToken || (!isResumeToken(otpToken) && (typeof code !== 'string' || !code))) {
    return NextResponse.json({ error: 'otpToken и code обязательны' }, { status: 400 })
  }

  const loginResult = await submitOtp(otpToken, typeof code === 'string' ? code : undefined)
  if (loginResult.status !== 'success') {
    if (loginResult.status !== 'error') {
      return NextResponse.json({ error: 'Не удалось завершить вход' }, { status: 400 })
    }
    // Error contract: { error (friendly ru text, never a URL), code?, detail?
    // (underlying network cause such as ECONNRESET), resumable, resumeToken? }.
    // Kaspi being unreachable is an upstream failure (502); everything else
    // keeps the historical 400.
    return NextResponse.json({
      error: loginResult.message,
      code: loginResult.code,
      detail: loginResult.detail,
      resumable: !!loginResult.resumeToken,
      resumeToken: loginResult.resumeToken,
    }, { status: loginResult.code === 'kaspi_unreachable' ? 502 : 400 })
  }
  const sessionCookies = loginResult.sessionCookies

  // The SMS code is already spent and the session issued. A transient network
  // failure in any Kaspi read below must not force a new SMS: reads are
  // retried (bounded), and if they still fail the client gets the same
  // resumable contract as a failed redirect walk (resumeToken made from the
  // issued session, passed back WITHOUT a code).
  try {
    return await finishConnect(user.id, sessionCookies, !!isReconnect)
  } catch (err) {
    if (err instanceof KaspiNetworkError) {
      logNetworkFailure('post_login', err)
      const failed = unreachableResult('otp', err, resumeTokenFromSession(sessionCookies))
      if (failed.status !== 'error') throw err
      return NextResponse.json({
        error: failed.message,
        code: failed.code,
        detail: failed.detail,
        resumable: !!failed.resumeToken,
        resumeToken: failed.resumeToken,
      }, { status: 502 })
    }
    throw err
  }
}

async function finishConnect(userId: string, sessionCookies: string, isReconnect: boolean) {
  const merchants = await withConnectionRetry(() => listMerchants(sessionCookies))
  if (merchants.length === 0) {
    return NextResponse.json({ error: 'На этом номере не найдено ни одного магазина Kaspi' }, { status: 400 })
  }

  const named = await Promise.all(merchants.map(async m => {
    const info = await withConnectionRetry(() => getMerchantInfo(sessionCookies, m.uid))
    return { id: m.uid, name: info?.name || m.uid }
  }))

  if (named.length > 1) {
    // A reconnect (session expired for the store already connected) already
    // knows which merchant(s) it's for -- the picker exists so a seller can
    // choose between DIFFERENT merchants on one phone number when adding a
    // NEW store, not to make them re-pick a store they're already connected
    // to every time its session expires (real friction reported live
    // 2026-09-03 on the Abil-Sisters/ИП FIRST PROJECT phone number).
    //
    // This one phone/OTP login already reaches every merchant in `named`
    // (that's what listMerchants just confirmed), so it refreshes EVERY one
    // of the user's existing connections that matches, not only whichever
    // one was showing the reconnect banner -- the same "log in once, every
    // shop you have access to comes back" behavior as Kaspi's own cabinet
    // (founder request 2026-09-14: one login shouldn't leave a second,
    // equally-reachable shop still stuck behind its own separate reconnect).
    if (isReconnect) {
      const existing = await listConnections(userId)
      const toRefresh = named.filter(m => existing.some(c => c.merchantId === m.id))
      if (toRefresh.length > 0) {
        const results = await Promise.all(
          toRefresh.map(m => finalizeConnection(userId, sessionCookies, m.id, m.name, { runInBackground: after }))
        )
        return NextResponse.json({
          status: 'connected',
          companyName: toRefresh.map(m => m.name).join(', '),
          refreshedCount: toRefresh.length,
          importedProducts: results.reduce((sum, r) => sum + (r.importedProducts ?? 0), 0),
        })
      }
    }
    return NextResponse.json({
      status: 'merchant_required',
      sessionToken: Buffer.from(sessionCookies, 'utf8').toString('base64'),
      merchants: named,
    })
  }

  const { importedProducts } = await finalizeConnection(userId, sessionCookies, named[0].id, named[0].name, { runInBackground: after })
  return NextResponse.json({ status: 'connected', companyName: named[0].name, importedProducts })
}
