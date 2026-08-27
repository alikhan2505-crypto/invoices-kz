import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import {
  exchangeWhatsAppCode,
  registerWhatsAppPhoneNumber,
  subscribeWhatsAppWebhooks,
  getWhatsAppDisplayPhoneNumber,
  isWhatsAppPhoneNumberVerified,
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
async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  const code = body?.code
  const phoneNumberId = body?.phoneNumberId
  const wabaId = body?.wabaId
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

  try {
    // 1. Exchange the ES code for a system-user access token.
    const { accessToken } = await exchangeWhatsAppCode(code, appId, appSecret)

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
    try {
      await registerWhatsAppPhoneNumber(phoneNumberId, accessToken)
    } catch (registerError: any) {
      const verified = await isWhatsAppPhoneNumberVerified(phoneNumberId, accessToken)
      if (!verified) throw registerError
      console.error('ai-agent WhatsApp register call failed but number is independently confirmed VERIFIED -- continuing:', registerError instanceof WhatsAppApiError ? `[${registerError.status}] ${registerError.message}` : registerError.message)
    }

    // 3. Subscribe OUR app to this WABA's webhooks -- required, not
    // best-effort: an unsubscribed connection looks connected but never
    // hears anything (same lesson as Instagram's per-account subscription,
    // 2026-08-16).
    await subscribeWhatsAppWebhooks(wabaId, accessToken)

    // 4. Persist. Same unique key as Instagram/Telegram --
    // (channel, external_account_id) -- reconnecting the same number
    // overwrites the existing row and restores status 'active'.
    const encryptedToken = encryptAtRest(accessToken, getKey())
    const { error: upsertError } = await supabase.from('ai_agent_channel_connections').upsert({
      agent_id: agentId,
      channel: 'whatsapp',
      external_account_id: phoneNumberId,
      waba_id: wabaId,
      access_token_enc: encryptedToken,
      status: 'active',
    }, { onConflict: 'channel,external_account_id' })
    if (upsertError) throw new Error(upsertError.message)

    // 5. Best-effort display number for the settings-page chip.
    const displayPhoneNumber = await getWhatsAppDisplayPhoneNumber(phoneNumberId, accessToken)

    return NextResponse.json({ ok: true, phoneNumberId, displayPhoneNumber })
  } catch (e: any) {
    console.error('ai-agent WhatsApp connect failed:', e instanceof WhatsAppApiError ? `[${e.status}] ${e.message}` : e.message)
    return NextResponse.json({ error: 'connect_failed' }, { status: 502 })
  }
}
