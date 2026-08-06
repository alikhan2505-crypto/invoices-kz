// Matches "/start <token>" or "/start@bot_username <token>" (Telegram appends
// the bot's own username to commands in some contexts) -- returns the token,
// or null for anything else (bare "/start", a non-command message, etc.).
export function parseStartToken(text: string): string | null {
  const match = text.match(/^\/start(?:@\S+)?\s+(\S+)$/)
  return match ? match[1] : null
}

// Fire-and-forget by design, matching every other outbound Telegram call in
// this codebase (src/app/api/instagram/telegram-webhook/route.ts's own
// `telegram()` helper) -- a failed send here must never break the caller's
// own primary action (marking an invoice paid, the daily notification cron
// continuing to the next row), so this never throws.
export async function sendTelegramNotification(chatId: string, text: string): Promise<void> {
  const token = process.env.CUSTOMER_TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('sendTelegramNotification: CUSTOMER_TELEGRAM_BOT_TOKEN is not configured')
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch (e: any) {
    console.error('sendTelegramNotification delivery failed for chat', chatId, ':', e.message)
  }
}
