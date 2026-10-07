import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCfoDigest } from '@/lib/cfo/digestSend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Утренняя сводка CFO: 03:00 UTC = 08:00 в Алматы. Только для компаний, где
// владелец сам включил её в настройках кабинета.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: companies, error } = await supabase.from('cfo_companies').select('user_id').eq('telegram_digest', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = { sent: 0, failed: 0 }
  for (const c of companies ?? []) {
    try {
      const r = await sendCfoDigest(supabase, c.user_id)
      counts[r] = (counts[r] ?? 0) + 1
    } catch (e) {
      // Сбой одного кабинета не должен останавливать рассылку остальным.
      counts.failed++
      console.error('cron/cfo-digest failed for user', c.user_id, ':', e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ success: true, ...counts })
}
