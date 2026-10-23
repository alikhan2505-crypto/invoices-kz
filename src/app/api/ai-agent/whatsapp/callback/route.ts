import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { getActivePlan } from '@/lib/plan'
import { markLaunchedIfLive } from '@/lib/aiAgent/launchMark'
import {
  exchangeWhatsAppCode,
  registerWhatsAppPhoneNumber,
  subscribeWhatsAppWebhooks,
  getWhatsAppDisplayPhoneNumber,
  isWhatsAppPhoneNumberVerified,
  isPhoneNumberInWaba,
  WhatsAppApiError,
} from '@/lib/whatsapp'

// Completes WhatsApp Embedded Signup (ES v4) -- the frontend's FB.login
// popup hands back a one-time `code` plus the phone_number_id/waba_id it
// captured from the SDK's postMessage events (see settings/page.tsx). This
// is a same-page POST from OUR OWN frontend, not a browser redirect from
// Meta (unlike the Instagram OAuth callback), so auth is the normal
// Bearer-token pattern, not a signed `state` param.

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

// AI-агент is admin-only for now -- same requireAdmin shape as the other
// ai-agent routes (see settings/route.ts for the 401-vs-403 reasoning).
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  const code = body?.code
  const phoneNumberId = body?.phoneNumberId
  const wabaId = body?.wabaId
  // Meta names the Coexistence completion differently from a normal one:
  // FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING against plain FINISH. That is
  // the only signal that the number is already live in the seller's phone
  // app, and it changes what this route must and must not do.
  // ТОЛЬКО подсказка: поле приходит от клиента, поэтому на доступ оно не влияет
  // (только пропускает register и пишется в is_coexistence) -- доступ решает
  // проверка isPhoneNumberInWaba ниже.
  const isCoexistence = body?.esEvent === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (!code || typeof code !== 'string') return NextResponse.json({ error: 'code required' }, { status: 400 })
  if (!phoneNumberId || typeof phoneNumberId !== 'string') return NextResponse.json({ error: 'phoneNumberId required' }, { status: 400 })
  if (!wabaId || typeof wabaId !== 'string') return NextResponse.json({ error: 'wabaId required' }, { status: 400 })

  // Ownership: the connection attaches to THIS user's agent only.
  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const appId = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appId || !appSecret) return NextResponse.json({ error: 'whatsapp_not_configured' }, { status: 500 })

  // phoneNumberId/wabaId попадают в URL-путь Graph API и приходят из браузера --
  // только цифры (Meta-идентификаторы), чтобы не подсунуть путь вида «123/../».
  if (!/^\d{1,40}$/.test(phoneNumberId) || !/^\d{1,40}$/.test(wabaId)) {
    return NextResponse.json({ error: 'invalid_ids' }, { status: 400 })
  }

  try {
    // 1. Exchange the ES code for a system-user access token.
    const { accessToken } = await exchangeWhatsAppCode(code, appId, appSecret)

    // 1a. Доказать, что номер принадлежит WABA, а WABA -- доступен ЭТОМУ токену.
    // Раньше единственной проверкой доступа к номеру был вызов register, а флаг
    // coexistence (приходит из тела запроса, то есть от клиента) его отключал:
    // Pro-аккаунт мог прислать свой валидный code, esEvent=FINISH_WHATSAPP_
    // BUSINESS_APP_ONBOARDING и ЧУЖОЙ phoneNumberId -- и upsert ниже перезаписал
    // бы чужую строку. Теперь проверка идёт всегда и по данным Meta, а не по
    // словам клиента (аудит 24.10.2026, webhooks-cron-1).
    if (!(await isPhoneNumberInWaba(wabaId, phoneNumberId, accessToken))) {
      console.error('ai-agent WhatsApp connect refused: phone_number_id not in waba for user', user.id)
      return NextResponse.json({
        error: 'phone_not_in_waba',
        detail: 'Этот номер не принадлежит выбранному WhatsApp Business аккаунту. Подключите номер заново через окно Meta.',
      }, { status: 403 })
    }

    // 1b. Номер уже подключён к агенту ДРУГОГО пользователя -- не перезаписываем
    // его строку (иначе сообщения клиентов прежнего владельца уйдут сюда).
    // Тот же агент или другой агент того же пользователя -- обычное
    // переподключение, оно проходит. Проверка идёт до register/subscribe:
    // отказ не должен оставлять побочных эффектов в аккаунте Meta.
    const { data: existing } = await supabase
      .from('ai_agent_channel_connections')
      .select('agent_id')
      .eq('channel', 'whatsapp')
      .eq('external_account_id', phoneNumberId)
      .maybeSingle()
    if (existing && existing.agent_id !== agentId) {
      const { data: ownerAgent } = await supabase.from('ai_agents').select('user_id').eq('id', existing.agent_id).maybeSingle()
      if (!ownerAgent || ownerAgent.user_id !== user.id) {
        console.error('ai-agent WhatsApp connect refused: number already connected to another account, user', user.id)
        return NextResponse.json({
          error: 'number_already_connected',
          detail: 'Этот номер WhatsApp уже подключён к другому аккаунту. Если это ваш номер, отключите его там или напишите в поддержку.',
        }, { status: 409 })
      }
    }

    // 2. Register the number for Cloud API messaging -- without this the
    // number can't send/receive through the API at all. Embedded Signup v4
    // already completes this INSIDE its own popup for most connect
    // attempts (the phone-verification screen the customer sees), making
    // our own call here redundant -- Meta then rejects it with a generic
    // "(#10) Application does not have permission for this action" that
    // looks identical to a genuine permission failure. Never assume that
    // generic message means "already done, safe to ignore" -- independently
    // re-check the number's real verification status with Meta before
    // deciding, and only then continue; otherwise let the original error
    // propagate and fail the connect attempt honestly.
    //
    // Coexistence skips this entirely: the number is already registered for
    // Cloud API because it is already live in the seller's WhatsApp Business
    // app, and calling register on it fails with that same generic message.
    // It happened to survive anyway — the failure fell into the verified-
    // number branch below — but relying on an error path to reach the right
    // outcome is not a design, and the recovery costs an extra round trip to
    // Meta on every Coexistence connect.
    if (!isCoexistence) {
      try {
        await registerWhatsAppPhoneNumber(phoneNumberId, accessToken)
      } catch (registerError: any) {
        const verified = await isWhatsAppPhoneNumberVerified(phoneNumberId, accessToken)
        if (!verified) throw registerError
        console.error('ai-agent WhatsApp register call failed but number is independently confirmed VERIFIED -- continuing:', registerError instanceof WhatsAppApiError ? `[${registerError.status}] ${registerError.message}` : registerError.message)
      }
    }

    // 3. Subscribe OUR app to this WABA's webhooks -- required, not
    // best-effort: an unsubscribed connection looks connected but never
    // hears anything (same lesson as Instagram's per-account subscription,
    // 2026-08-16).
    await subscribeWhatsAppWebhooks(wabaId, accessToken)

    // 4. Best-effort display number for the settings-page chip -- fetched
    // BEFORE the upsert now so it is stored in external_account_name (it used
    // to be only returned to the browser, so after a reload the chip fell
    // back to plain «WhatsApp»). null (Meta hiccup) leaves the column out of
    // the upsert, so a reconnect never wipes a number already stored.
    const displayPhoneNumber = await getWhatsAppDisplayPhoneNumber(phoneNumberId, accessToken)

    // 5. Persist. Same unique key as Instagram/Telegram --
    // (channel, external_account_id) -- reconnecting the same number
    // overwrites the existing row and restores status 'active'.
    const encryptedToken = encryptAtRest(accessToken, getKey())
    const { error: upsertError } = await supabase.from('ai_agent_channel_connections').upsert({
      agent_id: agentId,
      channel: 'whatsapp',
      external_account_id: phoneNumberId,
      waba_id: wabaId,
      is_coexistence: isCoexistence,
      access_token_enc: encryptedToken,
      status: 'active',
      ...(displayPhoneNumber ? { external_account_name: displayPhoneNumber } : {}),
    }, { onConflict: 'channel,external_account_id' })
    if (upsertError) throw new Error(upsertError.message)

    await markLaunchedIfLive(supabase, agentId)
    return NextResponse.json({ ok: true, phoneNumberId, displayPhoneNumber })
  } catch (e: any) {
    const detail = e instanceof WhatsAppApiError ? `[${e.status}] ${e.message}` : e?.message
    console.error('ai-agent WhatsApp connect failed:', detail)
    // Hand the reason back, not just `connect_failed`. This is the caller's own
    // connection attempt against their own WhatsApp account, so Meta's message
    // is theirs to see -- and without it every failure looked identical on
    // screen while the only copy of the cause sat in a server log with a
    // one-day retention window.
    return NextResponse.json({ error: 'connect_failed', detail }, { status: 502 })
  }
}
