import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadWhatsAppConnection } from '@/lib/aiAgent/whatsappWebhookHandler'
import { checkWhatsAppLoginHealth, healthAlertText } from '@/lib/whatsappLogin/health'
import { sendFounderTelegram } from '@/lib/founderTelegram'
import { claimWindowSlot, dayBucket, windowKey } from '@/lib/windowLimits'

// Страница входа спрашивает, показывать ли кнопку «Войти через WhatsApp»: показываем, только пока связь с
// номером входа жива. Ответ одинаков для всех, поэтому его держит CDN (две минуты): запросов к Meta
// не больше одного в две минуты на регион. Обрыв связи раз в сутки уходит основателю в Telegram.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const health = await checkWhatsAppLoginHealth({ loadConnection: loadWhatsAppConnection })

  if (health.state === 'down') {
    // Не чаще раза в сутки. Сбой счётчика не мешает ответу.
    const slot = await claimWindowSlot(supabase, windowKey('walogin-down-alert', 'founder', dayBucket()), 1)
    if (slot.ok) {
      const sent = await sendFounderTelegram(healthAlertText(health.reason))
      if (!sent.ok) console.error('whatsapp login: founder alert failed:', sent.reason)
    }
  }

  return NextResponse.json(
    { available: health.state === 'ok' },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  )
}
