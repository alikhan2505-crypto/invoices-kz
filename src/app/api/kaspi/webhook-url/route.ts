import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSafeWebhookUrl } from '@/lib/kaspiPay/webhookSafety'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Sets the default callback_url used by /api/kaspi/pay whenever a caller's
// own request omits one — same SSRF guard (https-only, rejects anything that
// resolves to a private/loopback/link-local address) as the one already
// applied to a per-request callback_url before this cron/route ever fetches it.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url } = await req.json()

  // Explicit null/empty clears the default — not an error.
  if (url) {
    if (!(await isSafeWebhookUrl(url))) {
      return NextResponse.json({ error: 'unsafe_url' }, { status: 400 })
    }
  }

  const { error } = await supabase
    .from('kaspi_connections')
    .update({ default_webhook_url: url || null })
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
