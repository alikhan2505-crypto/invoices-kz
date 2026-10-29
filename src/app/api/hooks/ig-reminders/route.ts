import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hookSecretOk, throttled } from '@/lib/hooksGuard'
import { sendInstagramTextMessage } from '@/lib/instagram'
import { agentCanReply } from '@/lib/aiAgent/planGate'
import { loadTenantConnectionByAgentId, markTokenExpiredIfUnauthorized } from '@/lib/aiAgent/webhookHandler'
import { attributionReady, runDmReminders } from '@/lib/aiAgent/dmReminder'
import { createReminderStore } from '@/lib/aiAgent/dmReminderStore'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Отправки последовательные (до 20 с каждая по таймауту), поэтому потолок функции задан явно;
// сам прогон дополнительно ограничен бюджетом времени (REMINDER_TIME_BUDGET_MS в dmReminder.ts).
export const maxDuration = 60

// Напоминание в директе Instagram через ~2 часа после ответа на КОНТРАГЕНТ
// (логика и гарантии -- src/lib/aiAgent/dmReminder.ts). Зовётся pg_cron + pg_net
// каждые 10 минут (supabase/migrations/ig_dm_reminders_cron.sql).
//
// Защита, в отличие от welcome-instant, ЗАКРЫТАЯ: без IG_REMINDER_CRON_SECRET в
// окружении эндпоинт всегда отвечает 401, а с ним нужен заголовок x-internal-secret
// с тем же значением (его pg_cron берёт из Supabase Vault, в миграции секрета нет).
// Отдельная переменная, а не общий HOOKS_PG_NET_SECRET: тот включил бы проверку и
// у new-signup/welcome-instant, чьи SQL-вызовы заголовка пока не шлют.
// Дополнительно: не чаще раза в минуту на инстанс. Ответ только счётчики, без данных людей.
export async function POST(req: NextRequest) {
  const secret = process.env.IG_REMINDER_CRON_SECRET
  if (!secret || !hookSecretOk(req.headers, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (throttled('ig-reminders', 60_000)) return NextResponse.json({ ok: true, throttled: true })

  try {
    const summary = await runDmReminders({
      store: createReminderStore(supabase),
      attributionReady: () => attributionReady(supabase),
      agentCanReply: async agentId => {
        const { data: agent } = await supabase.from('ai_agents').select('id, user_id, is_enabled').eq('id', agentId).maybeSingle()
        return !!agent && (await agentCanReply(supabase, agent))
      },
      loadConnection: async agentId => {
        const c = await loadTenantConnectionByAgentId(agentId)
        return c ? { connectionId: c.connectionId, externalAccountId: c.externalAccountId, accessToken: c.accessToken } : null
      },
      sendText: (conn, recipientId, text) =>
        sendInstagramTextMessage(recipientId, text, { igUserId: conn.externalAccountId, accessToken: conn.accessToken }),
      onSendError: (connectionId, err) => markTokenExpiredIfUnauthorized(connectionId, err),
    })
    // Только счётчики и коды причин.
    console.log('hooks/ig-reminders:', JSON.stringify(summary))
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    console.error('hooks/ig-reminders: run failed:', e instanceof Error ? e.name : 'error')
    return NextResponse.json({ error: 'run failed' }, { status: 500 })
  }
}
