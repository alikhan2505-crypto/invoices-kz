// Транспорт «сообщение основателю» через админ-бота (TELEGRAM_BOT_TOKEN →
// TELEGRAM_CHAT_ID, тот же, что у /api/telegram). Простой текст без
// parse_mode: отчёты строятся отдельно (например src/lib/visits/report.ts) и
// не должны зависеть от HTML-разметки — тот же текст сможет уйти и в WhatsApp.
// Не бросает: возвращает, получилось ли, чтобы вызывающий мог отпустить
// «захват» дня и дать повтору шанс.
export type FounderSendResult = { ok: true } | { ok: false; reason: string }

export async function sendFounderTelegram(text: string, opts?: { timeoutMs?: number }): Promise<FounderSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return { ok: false, reason: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 15000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, reason: `telegram ${res.status}: ${body.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
