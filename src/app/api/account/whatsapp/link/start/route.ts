import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildLinkWaMeUrl, loginConfig } from '@/lib/whatsappLogin/helpers'
import { createLinkCode, linkedWaId } from '@/lib/whatsappLogin/link'
import { isPlaceholderEmail } from '@/lib/whatsappLogin/placeholderEmail'
import { loadWhatsAppConnection } from '@/lib/aiAgent/whatsappWebhookHandler'
import { claimWindowSlot, hourBucket, windowKey } from '@/lib/windowLimits'
import { serverError } from '@/lib/apiError'

// Шаг 1 привязки WhatsApp к аккаунту из профиля: код «Привязать <код>» и ссылка на чат с номером входа.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const LINK_STARTS_PER_USER_PER_HOUR = 5

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // У вошедшего по WhatsApp номер уже привязан: привязывать нечего.
  if (isPlaceholderEmail(user.email)) return NextResponse.json({ error: 'not_needed' }, { status: 400 })

  const cfg = loginConfig()
  if (!cfg) return NextResponse.json({ error: 'disabled' }, { status: 503 })
  const conn = await loadWhatsAppConnection(cfg.phoneNumberId).catch(() => 'unknown' as const)
  if (conn === null) return NextResponse.json({ error: 'unavailable' }, { status: 503 })

  const slot = await claimWindowSlot(supabase, windowKey('walink-start', user.id, hourBucket()), LINK_STARTS_PER_USER_PER_HOUR)
  if (!slot.ok && slot.reason === 'limit') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  try {
    if (await linkedWaId(supabase, user.id)) return NextResponse.json({ error: 'already_linked' }, { status: 409 })
    const code = await createLinkCode(supabase, user.id)
    return NextResponse.json({ url: buildLinkWaMeUrl(cfg.displayNumber, code), number: cfg.displayNumber })
  } catch (e) {
    return serverError('account/whatsapp/link/start', e)
  }
}
